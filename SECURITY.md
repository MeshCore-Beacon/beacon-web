# Security Policy

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Instead, contact the maintainers directly via the MeshCore Canada Discord
server: [MeshCore Canada Discord](https://discord.gg/Gz3KvJx2hf) — reach out to
**dedskelly** directly. Include as much detail as possible: the nature of the
issue, steps to reproduce, and any potential impact.

We will acknowledge receipt within 48 hours and aim to provide a fix or
mitigation within 14 days depending on severity.

Once a fix is released we will publish a security advisory on the repository.

## Scope

beacon-web is a static single-page app that reads from the beacon-server REST
and WebSocket API. It ships no authentication layer and stores no secrets — the
build is served as static assets behind a reverse proxy. Relevant findings
include issues in the served application (e.g. XSS, dependency vulnerabilities)
or the build/deployment pipeline. Vulnerabilities in the backend API itself
belong in the [beacon-server](https://github.com/MeshCore-Beacon/beacon-server)
repository.
