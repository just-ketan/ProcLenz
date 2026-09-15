package com.proclenz.event;

import static com.proclenz.event.EventIdentity.contentHash;
import static com.proclenz.event.EventIdentity.identity;
import static org.assertj.core.api.Assertions.assertThat;

import com.proclenz.common.Hashing;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.Test;

class EventIdentityTest {
    private static final Instant AT = Instant.parse("2026-09-01T09:00:00Z");

    @Test
    void identicalContentProducesTheSameIdentity() {
        String first = contentHash("orders", "ORD-1", "Order Created", AT, "system");
        String second = contentHash("orders", "ORD-1", "Order Created", AT, "system");

        assertThat(first).isEqualTo(second).hasSize(64);
        assertThat(identity("orders", null, first)).isEqualTo(first);
    }

    @Test
    void everyContentFieldParticipates() {
        Set<String> hashes = Set.of(
                contentHash("orders", "ORD-1", "Order Created", AT, "system"),
                contentHash("billing", "ORD-1", "Order Created", AT, "system"),
                contentHash("orders", "ORD-2", "Order Created", AT, "system"),
                contentHash("orders", "ORD-1", "Order Shipped", AT, "system"),
                contentHash("orders", "ORD-1", "Order Created", AT.plusNanos(1_000), "system"),
                contentHash("orders", "ORD-1", "Order Created", AT, null));

        assertThat(hashes).hasSize(6);
    }

    @Test
    void producerEventIdIsTheIdentityRegardlessOfContentAndIsScopedToTheProcess() {
        String created = identity("orders", "evt-1", contentHash("orders", "ORD-1", "Order Created", AT, null));
        String shipped = identity("orders", "evt-1", contentHash("orders", "ORD-1", "Order Shipped", AT, null));

        assertThat(created).isEqualTo(shipped);
        assertThat(identity("billing", "evt-1", "ignored")).isNotEqualTo(created);
    }

    @Test
    void keepsTheOriginalFingerprintFormatSoRowsStoredBeforeTheUpgradeStillDeduplicate() {
        assertThat(contentHash("orders", "ORD-1001", "Order Created", AT, "system"))
                .isEqualTo(Hashing.sha256Hex("orders|ORD-1001|Order Created|2026-09-01T09:00:00Z|system"));
    }

    @Test
    void escapesTheDelimiterSoFieldBoundariesCannotCollide() {
        assertThat(contentHash("orders", "A|x", "y", AT, null)).isNotEqualTo(contentHash("orders", "A", "x|y", AT, null));
    }
}
