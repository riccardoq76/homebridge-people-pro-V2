# Changelog

## 0.13.0 (fork)
- [Bug] Fixed a real reliability issue in `pingFunction()` (`src/accessory.js`): if a MAC-address target could not be found on the network, or a custom DNS lookup failed, the polling loop would silently stop forever for that sensor instead of retrying on the next cycle. The loop is now wrapped in `try`/`finally` so the next check is always scheduled, no matter how the current one ends.
- [Bug] Fixed `e.getMessage()` (not a real method on JS `Error` objects) in the custom DNS error handler; it now correctly logs `e.message`.
- [Bug] `dns.setServers()` mutated the process-wide default DNS resolver on every lookup, so multiple sensors configured with different custom DNS servers could interfere with each other. Custom DNS lookups now use a dedicated `dns.Resolver` instance per call instead.
- [Security] Added an optional `webhookToken` config option. When set, webhook requests must include a matching `token` query parameter or are rejected with a 401. Previously the webhook endpoint had no authentication at all - anyone who could reach the port (including over the internet, if forwarded for Locative) could spoof any sensor's presence state. Existing setups keep working unchanged if `webhookToken` is left unset, but a startup log warning is now shown in that case.
- [Improvement] Removed the `moment` dependency; all date/time handling in `src/accessory.js` now uses native `Date` arithmetic.
- [Improvement] Removed the unused `request` dependency (deprecated, unmaintained, and not referenced anywhere in the codebase).

## 0.12.1 (fork)
- [Bug] Fixed a crash on startup under Homebridge v2: `TypeError: Cannot read properties of undefined (reading 'DATA')` thrown from `fakegato-history`'s `S2R1Characteristic`. The bundled `fakegato-history@0.5.0` reads the old, removed `Characteristic.Formats` enum internally, same root cause as the fix in 0.12.0, just inside a dependency instead of our own code. Bumped `fakegato-history` from `^0.5.0` to `^0.6.7`, which reads `Formats` from `homebridge.hap` and no longer touches the removed enum. No code changes needed on our side; `package-lock.json` updated accordingly.

## 0.12.0 (fork)
- [Compatibility] Fixed `Characteristic.Formats` / `Characteristic.Units` / `Characteristic.Perms` usage in the custom Eve characteristics (`src/accessory.js`). These enums were removed from the `Characteristic` class in HAP-NodeJS v1+ (used by Homebridge v2); they are now read from `hap` instead, exposed as `global.Formats` / `global.Units` / `global.Perms` in `index.js`.
- [Compatibility] Updated `engines.homebridge` to `^1.6.0 || ^2.0.0` and `engines.node` to `^22.12.0 || ^24.0.0` so Homebridge correctly reports this build as v2-ready.
- [Docs] Rewrote the README warning banner and badges to reflect that this is a personal fork, and fixed the installation instructions, which previously pointed to the original (unmaintained) `homebridge-people-pro` npm package instead of this fork.
- [Improvement] Added a `displayName` ("People Pro V2") so the plugin is easier to tell apart from the original in the Homebridge UI. The npm package name and the `PeoplePro` platform identifier in `config.json` are unchanged.

## 0.11.5
- [Security] Bumped `get-ip-range` to `^4.0.0` due to dependabot security alert (DoS)
## 0.11.4
- [Bug] Fixes a bug where occupancy sensors wouldn't update immediately after a ping/arp status change.

## 0.11.1
- [Improvement] :warning: anyoneSensor now defaults to false.
- [Bug] Fixes an unhandled exception on plug-in start when an invalid or incomplete config was given.
- [Bug] Fixes typo on the excludeFromWebhook config option.
- [Bug] Fixes several default config values.

## 0.11.0
- [Feature] You can now use a MAC address as a target. The corresponding IP address will be looked up through ARP before each sensor update (#9).

## 0.10.0
- [Feature] Adds option to add custom DNS server(s) to use for hostname look-ups prior to pinging (#8)

## 0.9.3
- [Bug] Fixed last activation callback handler when the sensor has not been activated in the past - fixes a warning message about the plugin slowing down Homebridge in Homebridge >= v1.3.1.

## 0.9.2
- [Improvement] "Anyone" and "No One" sensors can now also be configured as occupancy sensors.
- [Bug/Improvement] Several stability optimizations and bugfixes.

## 0.9.1
- [Feature] Sensors can now optionally be occupancy sensors instead of motion sensors (however this will disable fakegato support)
- [Improvement] Completely removed cacheDirectory config, defaulting to the Homebridge storage path
- [Bug] Fixed plugin start-up on macOS

## 0.9.0
- [Feature] "Anyone" and "No One" sensors can now be renamed
- [Feature] Added config schema for GUI configuration
- [Improvement] Webhooks are now an optional configuration so that the webserver is not exposed unnecessarily
- [Improvement] Specific targets / sensors can now be excluded from webhook functionality
- [Improvement] Renamed ignoreReEnterExitSeconds option to ignoreWebhookReEnter to make functionality more clear
- [Code] Added documentation in code

## 0.8.0
- [Feature] Added "pingUseArp" configuration
- [Code] Added ESLint for better code style
- [Code] Refactored complete codebase
odebase
