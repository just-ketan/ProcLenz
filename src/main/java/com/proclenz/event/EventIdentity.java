package com.proclenz.event;

import com.proclenz.common.Hashing;
import java.time.Instant;

/**
 * Idempotency keys for events.
 *
 * <pre>
 * contentHash = SHA-256( processKey | caseId | activity | occurredAt | resource )
 * identity    = contentHash                                        when the producer sends no event ID
 *             = SHA-256( "event-id" | processKey | producerEventId )  when it does
 * </pre>
 *
 * The dataset or upload an event arrived in is deliberately not part of the key: the same business
 * occurrence uploaded twice is one event, not two. {@code '|'} and {@code '\'} inside fields are
 * escaped so field boundaries cannot be forged, which leaves every value without those characters
 * hashing exactly as in the original V1 format; rows stored before the upgrade keep deduplicating.
 */
public final class EventIdentity {

    private EventIdentity() {
    }

    public static String contentHash(String processKey, String caseId, String activity, Instant occurredAt, String resource) {
        return Hashing.sha256Hex(String.join("|", escape(processKey), escape(caseId), escape(activity),
                occurredAt.toString(), resource == null ? "" : escape(resource)));
    }

    public static String identity(String processKey, String producerEventId, String contentHash) {
        if (producerEventId == null) return contentHash;
        return Hashing.sha256Hex(String.join("|", "event-id", escape(processKey), escape(producerEventId)));
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("|", "\\|");
    }
}
