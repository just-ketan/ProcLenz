package com.proclenz.common;

import java.util.List;

/** A stable page envelope, independent of Spring Data's internal {@code Page} serialisation. */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> of(List<T> content, int page, int size, long totalElements) {
        return new PageResponse<>(content, page, size, totalElements, (int) Math.ceil((double) totalElements / size));
    }
}
