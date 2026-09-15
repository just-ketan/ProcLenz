package com.proclenz.event;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

final class EventIdentity {
    private EventIdentity() { }
    static String of(String processKey, EventRequest request) {
        String canonical = String.join("|", processKey, request.caseId().trim(), request.activity().trim(),
                request.timestamp().toString(), request.resource() == null ? "" : request.resource().trim());
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte value : bytes) result.append(String.format("%02x", value));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 is required", exception); }
    }
}
