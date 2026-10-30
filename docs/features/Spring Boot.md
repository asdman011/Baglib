# Spring Boot executable-JAR loading

Investigated 2026-10-29 by Codex for the existing Stirling sidecar.

Verified supplied JAR contains `org/springframework/boot/loader/launch/PropertiesLauncher.class`. [Official documentation](https://docs.spring.io/spring-boot/specification/executable-jar/property-launcher.html) defines `loader.path` as additional classpath locations, including native-module JARs.

Baglib launches with `-Dloader.path=<engine>/natives -cp <server.jar> org.springframework.boot.loader.launch.PropertiesLauncher` only when that directory contains JPDFium native JARs; otherwise existing `-jar` launch remains. Java25/native-access flags, loopback binding and sidecar lifecycle remain unchanged.

Actual live verification proves health readiness and compound organizer/native split output with the external Windows module. This avoids modifying the supplied executable JAR or changing Baglib's Work→Edition→Source model. It does not prove compatibility with arbitrary other executable-JAR layouts.

Related: [JPDFium](JPDFium.md), [Stirling-PDF](Stirling-PDF.md).
