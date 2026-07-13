# Changelog

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
