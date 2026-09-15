package com.proclenz.event;

import java.util.List;
import java.util.UUID;

/**
 * Summary of one batch request. Counts always satisfy
 * {@code received = accepted + duplicates + conflicts + rejected}. Individual rejections are listed
 * up to a configured cap so a huge bad batch cannot produce a huge response.
 */
public record BatchIngestionResult(
        UUID batchId,
        long received,
        long accepted,
        long duplicates,
        long conflicts,
        long rejected,
        long durationMs,
        double eventsPerSecond,
        List<Rejection> rejections,
        boolean rejectionsTruncated) {

    /** @param index zero-based position of the item in the submitted batch */
    public record Rejection(long index, String code, String message) {
    }
}
