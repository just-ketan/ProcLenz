package com.proclenz;

import static org.assertj.core.api.Assertions.assertThat;

import com.proclenz.support.IntegrationTest;
import org.junit.jupiter.api.Test;

/** The context only starts if Flyway migrated PostgreSQL and Hibernate validated every entity against it. */
class ApplicationContextIT extends IntegrationTest {

    @Test
    void flywayMigratesTheSchemaThatHibernateValidates() {
        Integer failedMigrations = jdbcTemplate.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE NOT success", Integer.class);
        Integer appliedMigrations = jdbcTemplate.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class);

        assertThat(failedMigrations).isZero();
        assertThat(appliedMigrations).isPositive();
    }
}
