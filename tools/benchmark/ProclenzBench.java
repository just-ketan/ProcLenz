import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Dependency-free load generator for ProcLenz (Java 21 single-file program).
 *
 * <pre>
 * java tools/benchmark/ProclenzBench.java ingest    --events 10000 --batch-size 500 --concurrency 4 --process bench
 * java tools/benchmark/ProclenzBench.java analytics --process bench --requests 30
 * </pre>
 *
 * Latencies are client-observed wall-clock times per HTTP request, so they include JSON
 * serialisation, network stack and server processing. Percentiles use the nearest-rank method.
 */
public class ProclenzBench {

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            usage();
            return;
        }
        Options options = Options.parse(Arrays.copyOfRange(args, 1, args.length));
        switch (args[0]) {
            case "ingest" -> ingest(options);
            case "analytics" -> analytics(options);
            default -> usage();
        }
    }

    private static void usage() {
        System.out.println("""
                Usage: java tools/benchmark/ProclenzBench.java <ingest|analytics> [options]
                  --base-url     http://localhost:8080
                  --user         name:password (HTTP Basic, optional)
                  --process      process key (default: bench)
                  --events       events to ingest (default: 10000)
                  --batch-size   events per batch request (default: 500)
                  --concurrency  parallel ingestion clients (default: 4)
                  --case-prefix  case ID prefix; change it to avoid duplicates across runs
                  --seed         random seed for the synthetic process (default: 42)
                  --requests     measured requests per analytics endpoint (default: 30)
                  --warmup       warmup requests per analytics endpoint (default: 3)
                  --endpoints    comma-separated analytics views (default: variants,rework,bottlenecks,sla,graph)
                """);
    }

    // ---------------------------------------------------------------- ingestion

    private static void ingest(Options options) throws Exception {
        int events = options.intValue("events", 10_000);
        int batchSize = options.intValue("batch-size", 500);
        int concurrency = options.intValue("concurrency", 4);
        String process = options.value("process", "bench");
        String casePrefix = options.value("case-prefix", "C" + Long.toString(System.currentTimeMillis(), 36).toUpperCase(Locale.ROOT));
        URI uri = URI.create(options.value("base-url", "http://localhost:8080") + "/api/v1/events/batch");

        BatchSource source = new BatchSource(new OrderToCashGenerator(process, casePrefix, options.intValue("seed", 42)), events, batchSize);
        HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(10)).build();
        LatencyRecorder latencies = new LatencyRecorder();
        AtomicLong accepted = new AtomicLong(), duplicates = new AtomicLong(), rejected = new AtomicLong(), failures = new AtomicLong();

        System.out.printf("mode=ingest events=%d batchSize=%d concurrency=%d process=%s casePrefix=%s%n", events, batchSize, concurrency, process, casePrefix);
        long startedAt = System.nanoTime();
        try (ExecutorService pool = Executors.newFixedThreadPool(concurrency)) {
            List<Future<?>> workers = new ArrayList<>();
            for (int i = 0; i < concurrency; i++) {
                workers.add(pool.submit(() -> {
                    String body;
                    while ((body = source.next()) != null) {
                        HttpRequest request = options.authorize(HttpRequest.newBuilder(uri))
                                .timeout(Duration.ofMinutes(5))
                                .header("Content-Type", "application/json")
                                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
                        long sent = System.nanoTime();
                        try {
                            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
                            latencies.record(System.nanoTime() - sent);
                            if (response.statusCode() >= 300) {
                                failures.incrementAndGet();
                                System.err.println("HTTP " + response.statusCode() + ": " + abbreviate(response.body()));
                                continue;
                            }
                            accepted.addAndGet(extract(response.body(), "accepted"));
                            duplicates.addAndGet(extract(response.body(), "duplicates"));
                            rejected.addAndGet(extract(response.body(), "rejected") + extract(response.body(), "invalid"));
                        } catch (Exception exception) {
                            failures.incrementAndGet();
                            System.err.println("Request failed: " + exception);
                        }
                    }
                    return null;
                }));
            }
            for (Future<?> worker : workers) worker.get();
        }
        double wallSeconds = (System.nanoTime() - startedAt) / 1e9;

        System.out.printf("requests=%d failures=%d accepted=%d duplicates=%d rejected=%d%n",
                latencies.count(), failures.get(), accepted.get(), duplicates.get(), rejected.get());
        System.out.printf(Locale.ROOT, "wall=%.2fs throughput=%.1f events/s%n", wallSeconds, source.produced() / wallSeconds);
        System.out.println("batch request latency ms: " + latencies.summary());
    }

    // ---------------------------------------------------------------- analytics

    private static void analytics(Options options) throws Exception {
        String process = options.value("process", "bench");
        String baseUrl = options.value("base-url", "http://localhost:8080");
        int requests = options.intValue("requests", 30);
        int warmup = options.intValue("warmup", 3);
        List<String> endpoints = List.of(options.value("endpoints", "variants,rework,bottlenecks,sla,graph").split(","));
        HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(10)).build();

        System.out.printf("mode=analytics process=%s requests=%d warmup=%d%n", process, requests, warmup);
        for (String endpoint : endpoints) {
            URI uri = URI.create(baseUrl + "/api/v1/processes/" + process + "/" + endpoint.trim());
            LatencyRecorder latencies = new LatencyRecorder();
            int failures = 0;
            long bytes = 0;
            for (int i = 0; i < warmup + requests; i++) {
                HttpRequest request = options.authorize(HttpRequest.newBuilder(uri)).timeout(Duration.ofMinutes(5)).GET().build();
                long sent = System.nanoTime();
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
                long elapsed = System.nanoTime() - sent;
                if (response.statusCode() >= 300) failures++;
                if (i >= warmup) {
                    latencies.record(elapsed);
                    bytes = response.body().length();
                }
            }
            System.out.printf("%-12s failures=%d responseBytes=%d latency ms: %s%n", endpoint.trim(), failures, bytes, latencies.summary());
        }
    }

    // ---------------------------------------------------------------- helpers

    private static long extract(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\"\\s*:\\s*(\\d+)").matcher(json);
        return matcher.find() ? Long.parseLong(matcher.group(1)) : 0;
    }

    private static String abbreviate(String value) {
        return value.length() > 300 ? value.substring(0, 300) + "..." : value;
    }

    /** Hands out JSON-array batch bodies to concurrent workers without materialising the whole run. */
    static final class BatchSource {
        private final OrderToCashGenerator generator;
        private final int total;
        private final int batchSize;
        private final List<String> pending = new ArrayList<>();
        private int produced;

        BatchSource(OrderToCashGenerator generator, int total, int batchSize) {
            this.generator = generator;
            this.total = total;
            this.batchSize = batchSize;
        }

        synchronized String next() {
            if (produced >= total) return null;
            StringBuilder body = new StringBuilder(batchSize * 170).append('[');
            int inBatch = 0;
            while (inBatch < batchSize && produced < total) {
                if (pending.isEmpty()) pending.addAll(generator.nextCase());
                if (inBatch > 0) body.append(',');
                body.append(pending.removeFirst());
                inBatch++;
                produced++;
            }
            return body.append(']').toString();
        }

        synchronized int produced() {
            return produced;
        }
    }

    /**
     * Synthetic order-to-cash cases with realistic irregularities: skipped credit checks, an
     * approval bottleneck, inventory rework loops, slow shipping and unpaid invoices.
     */
    static final class OrderToCashGenerator {
        private static final Instant EPOCH = Instant.parse("2026-01-05T08:00:00Z");
        private final String process;
        private final String casePrefix;
        private final Random random;
        private int caseNumber;

        OrderToCashGenerator(String process, String casePrefix, long seed) {
            this.process = process;
            this.casePrefix = casePrefix;
            this.random = new Random(seed);
        }

        List<String> nextCase() {
            String caseId = casePrefix + "-" + (++caseNumber);
            Instant time = EPOCH.plus(Duration.ofMinutes(caseNumber * 7L));
            List<String> events = new ArrayList<>();
            time = emit(events, caseId, "Order Created", time, 0, "web-shop");
            if (random.nextDouble() < 0.9) time = emit(events, caseId, "Credit Check", time, minutes(10, 50), "credit-team");
            boolean slowApproval = random.nextDouble() < 0.2;
            time = emit(events, caseId, "Order Approved", time, slowApproval ? minutes(360, 1800) : minutes(15, 90), "approver-" + (1 + random.nextInt(5)));
            time = emit(events, caseId, "Inventory Check", time, minutes(20, 120), "warehouse-" + (1 + random.nextInt(3)));
            if (random.nextDouble() < 0.12) {
                time = emit(events, caseId, "Rework Required", time, minutes(30, 180), "warehouse-qa");
                time = emit(events, caseId, "Inventory Check", time, minutes(60, 240), "warehouse-" + (1 + random.nextInt(3)));
            }
            time = emit(events, caseId, "Pick", time, minutes(30, 240), "picker-" + (1 + random.nextInt(8)));
            time = emit(events, caseId, "Pack", time, minutes(10, 60), "packer-" + (1 + random.nextInt(4)));
            time = emit(events, caseId, "Ship", time, random.nextDouble() < 0.1 ? minutes(1440, 4320) : minutes(60, 600), "carrier");
            time = emit(events, caseId, "Invoice Generated", time, minutes(5, 120), "billing");
            if (random.nextDouble() < 0.95) emit(events, caseId, "Payment Received", time, minutes(1440, 20160), "bank");
            return events;
        }

        private long minutes(int min, int max) {
            return min + random.nextInt(max - min + 1);
        }

        private Instant emit(List<String> events, String caseId, String activity, Instant previous, long delayMinutes, String resource) {
            Instant time = previous.plus(Duration.ofMinutes(delayMinutes));
            events.add("{\"processKey\":\"" + process + "\",\"caseId\":\"" + caseId + "\",\"activity\":\"" + activity
                    + "\",\"timestamp\":\"" + time + "\",\"resource\":\"" + resource + "\"}");
            return time;
        }
    }

    static final class LatencyRecorder {
        private final List<Long> nanos = new ArrayList<>();

        synchronized void record(long value) {
            nanos.add(value);
        }

        synchronized int count() {
            return nanos.size();
        }

        synchronized String summary() {
            if (nanos.isEmpty()) return "n/a";
            long[] sorted = nanos.stream().mapToLong(Long::longValue).sorted().toArray();
            double average = Arrays.stream(sorted).average().orElse(0) / 1e6;
            return String.format(Locale.ROOT, "avg=%.1f p50=%.1f p95=%.1f p99=%.1f max=%.1f",
                    average, rank(sorted, 50), rank(sorted, 95), rank(sorted, 99), sorted[sorted.length - 1] / 1e6);
        }

        private static double rank(long[] sorted, int percentile) {
            int index = (int) Math.ceil(percentile / 100.0 * sorted.length) - 1;
            return sorted[Math.max(0, index)] / 1e6;
        }
    }

    record Options(Map<String, String> values) {
        static Options parse(String[] args) {
            Map<String, String> values = new HashMap<>();
            for (int i = 0; i + 1 < args.length; i += 2) {
                if (!args[i].startsWith("--")) throw new IllegalArgumentException("Expected --option, got " + args[i]);
                values.put(args[i].substring(2), args[i + 1]);
            }
            return new Options(values);
        }

        String value(String name, String fallback) {
            return values.getOrDefault(name, fallback);
        }

        int intValue(String name, int fallback) {
            return values.containsKey(name) ? Integer.parseInt(values.get(name)) : fallback;
        }

        HttpRequest.Builder authorize(HttpRequest.Builder builder) {
            String user = values.get("user");
            if (user == null) return builder;
            return builder.header("Authorization", "Basic " + Base64.getEncoder().encodeToString(user.getBytes(StandardCharsets.UTF_8)));
        }
    }
}
