# Security Policy

## Supported Versions

Security fixes are provided for the latest release branch.

## Reporting a Vulnerability

Please report vulnerabilities privately via repository security advisory or direct maintainer contact.

Include:
- Affected version
- Reproduction steps
- Expected impact
- Optional patch suggestion

## Security Considerations

- The applet invokes a local helper binary; keep filesystem permissions strict.
- DDC/CI access depends on local I2C permissions and monitor firmware behavior.
- Avoid running untrusted binaries in the applet directory.
