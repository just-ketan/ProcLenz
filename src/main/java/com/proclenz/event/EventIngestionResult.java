package com.proclenz.event;

import java.util.UUID;

public record EventIngestionResult(UUID eventId, String status, String eventIdentity) { }
