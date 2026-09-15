package com.proclenz.analytics.engine;

import com.proclenz.common.Hashing;
import java.util.List;

/**
 * Deterministic variant identifier: the first 16 hex characters (64 bits) of SHA-256 over the
 * activity sequence joined with the ASCII unit separator. The same sequence always yields the same
 * ID across runs, processes and nodes, so IDs are safe to cache, link and compare. The case list
 * query computes the identical value in SQL.
 */
public final class VariantId {
    public static final String SEPARATOR = "";
    private static final int LENGTH = 16;

    private VariantId() {
    }

    public static String of(List<String> activities) {
        return Hashing.sha256Hex(String.join(SEPARATOR, activities)).substring(0, LENGTH);
    }
}
