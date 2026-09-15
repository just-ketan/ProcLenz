package com.proclenz;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class ProclenzApplication {

    public static void main(String[] args) {
        // All timestamps are Instants, so the service runs in UTC regardless of host locale. This also
        // stops the PostgreSQL driver from sending host zone aliases (Windows JVMs report
        // "Asia/Calcutta") that servers without legacy tzdata reject during connection startup.
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(ProclenzApplication.class, args);
    }
}
