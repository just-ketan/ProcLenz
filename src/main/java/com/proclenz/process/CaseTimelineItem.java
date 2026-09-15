package com.proclenz.process;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
public record CaseTimelineItem(UUID eventId, int sequence, String activity, Instant timestamp, String resource,
                               Duration sincePrevious, Duration cumulativeDuration) { }
