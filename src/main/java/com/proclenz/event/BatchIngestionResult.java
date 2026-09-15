package com.proclenz.event;

import java.util.List;

public record BatchIngestionResult(int accepted, int duplicates, int invalid, List<BatchItemResult> results) {
    public record BatchItemResult(int index, String status, String message, EventIngestionResult event) { }
}
