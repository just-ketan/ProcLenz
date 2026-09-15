package com.proclenz.analytics;

import com.proclenz.event.ProcessEvent;
import com.proclenz.event.ProcessEventRepository;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProcessAnalyticsService {
    private final ProcessEventRepository repository;
    public ProcessAnalyticsService(ProcessEventRepository repository) { this.repository = repository; }
    @Transactional(readOnly = true)
    public List<AnalyticsResponses.Variant> variants(String processKey, Duration sla) {
        Map<String, List<ProcessEvent>> cases = cases(processKey); long total = cases.size();
        Map<String, List<List<ProcessEvent>>> grouped = cases.values().stream().collect(Collectors.groupingBy(this::sequence));
        return grouped.entrySet().stream().map(entry -> {
            List<Duration> durations = entry.getValue().stream().map(this::duration).sorted().toList();
            long violations = durations.stream().filter(value -> value.compareTo(sla) > 0).count();
            return new AnalyticsResponses.Variant(entry.getKey(), durations.size(), percent(durations.size(), total), average(durations), median(durations), percent(violations, durations.size()));
        }).sorted(Comparator.comparingLong(AnalyticsResponses.Variant::caseCount).reversed()).toList();
    }
    @Transactional(readOnly = true)
    public List<AnalyticsResponses.Rework> rework(String processKey) {
        Map<String, long[]> totals = new HashMap<>();
        for (List<ProcessEvent> events : cases(processKey).values()) {
            Map<String, Long> counts = events.stream().collect(Collectors.groupingBy(ProcessEvent::getActivity, Collectors.counting()));
            counts.forEach((activity, count) -> { if (count > 1) { long[] value = totals.computeIfAbsent(activity, ignored -> new long[2]); value[0]++; value[1] += count - 1; } });
        }
        return totals.entrySet().stream().map(entry -> new AnalyticsResponses.Rework(entry.getKey(), entry.getValue()[0], entry.getValue()[1]))
                .sorted(Comparator.comparingLong(AnalyticsResponses.Rework::repeatOccurrences).reversed()).toList();
    }
    @Transactional(readOnly = true)
    public AnalyticsResponses.Sla sla(String processKey, Duration threshold) {
        List<AnalyticsResponses.Violation> violations = new ArrayList<>(); long compliant = 0;
        for (Map.Entry<String, List<ProcessEvent>> entry : cases(processKey).entrySet()) { Duration value = duration(entry.getValue()); if (value.compareTo(threshold) > 0) violations.add(new AnalyticsResponses.Violation(entry.getKey(), value, value.minus(threshold))); else compliant++; }
        violations.sort(Comparator.comparing(AnalyticsResponses.Violation::overBy).reversed());
        return new AnalyticsResponses.Sla(compliant, violations.size(), percent(violations.size(), compliant + violations.size()), violations.stream().limit(10).toList());
    }
    @Transactional(readOnly = true)
    public List<AnalyticsResponses.Bottleneck> bottlenecks(String processKey) {
        Map<String, List<Duration>> waits = transitions(cases(processKey)); Duration total = cases(processKey).values().stream().map(this::duration).reduce(Duration.ZERO, Duration::plus);
        return waits.entrySet().stream().map(entry -> { String[] key = entry.getKey().split("\\u0000", 2); List<Duration> values = entry.getValue().stream().sorted().toList(); Duration sum = values.stream().reduce(Duration.ZERO, Duration::plus);
            return new AnalyticsResponses.Bottleneck(key[0], key[1], values.size(), average(values), percentile95(values), total.isZero() ? 0 : (double) sum.toMillis() / total.toMillis()); })
                .sorted(Comparator.comparing(AnalyticsResponses.Bottleneck::averageWait).reversed()).toList();
    }
    @Transactional(readOnly = true)
    public AnalyticsResponses.Graph graph(String processKey) {
        Map<String, List<ProcessEvent>> cases = cases(processKey); Map<String, List<Duration>> transitions = transitions(cases);
        Map<String, Long> frequencies = cases.values().stream().flatMap(List::stream).collect(Collectors.groupingBy(ProcessEvent::getActivity, Collectors.counting()));
        long totalTransitions = transitions.values().stream().mapToLong(List::size).sum(); Set<String> reworked = rework(processKey).stream().map(AnalyticsResponses.Rework::activity).collect(Collectors.toSet());
        List<AnalyticsResponses.Edge> edges = transitions.entrySet().stream().map(entry -> { String[] key = entry.getKey().split("\\u0000", 2); return new AnalyticsResponses.Edge(key[0], key[1], entry.getValue().size(), percent(entry.getValue().size(), totalTransitions), average(entry.getValue()), reworked.contains(key[0]) || reworked.contains(key[1])); }).toList();
        return new AnalyticsResponses.Graph(frequencies.entrySet().stream().map(value -> new AnalyticsResponses.Node(value.getKey(), value.getValue())).toList(), edges);
    }
    private Map<String, List<ProcessEvent>> cases(String processKey) { return repository.findByProcessKeyOrderByCaseIdAscOccurredAtAscIdAsc(processKey).stream().collect(Collectors.groupingBy(ProcessEvent::getCaseId)); }
    private Map<String, List<Duration>> transitions(Map<String, List<ProcessEvent>> cases) { Map<String, List<Duration>> result = new HashMap<>(); for (List<ProcessEvent> events : cases.values()) for (int i=1;i<events.size();i++) result.computeIfAbsent(events.get(i-1).getActivity()+"\u0000"+events.get(i).getActivity(), ignored -> new ArrayList<>()).add(Duration.between(events.get(i-1).getOccurredAt(), events.get(i).getOccurredAt())); return result; }
    private String sequence(List<ProcessEvent> events) { return events.stream().map(ProcessEvent::getActivity).collect(Collectors.joining(" -> ")); }
    private Duration duration(List<ProcessEvent> events) { return events.size() < 2 ? Duration.ZERO : Duration.between(events.getFirst().getOccurredAt(), events.getLast().getOccurredAt()); }
    private Duration average(List<Duration> values) { return values.isEmpty() ? Duration.ZERO : Duration.ofMillis(values.stream().mapToLong(Duration::toMillis).sum() / values.size()); }
    private Duration median(List<Duration> values) { return values.isEmpty() ? Duration.ZERO : values.get((values.size() - 1) / 2); }
    private Duration percentile95(List<Duration> sorted) { return sorted.isEmpty() ? Duration.ZERO : sorted.get((int) Math.ceil(sorted.size() * .95) - 1); }
    private double percent(long value, long total) { return total == 0 ? 0 : Math.round(value * 10000.0 / total) / 100.0; }
}
