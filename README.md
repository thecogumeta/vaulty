<div align="center">
    <h1>Vaulty</h1>
    <p>A dependency manager for Roblox packages, inspired by Wally's workflow.</p>
    <!--<a href="https://thecogumeta.github.io/vaulty/"><strong>View docs</strong></a>-->
</div>

## Why Vaulty?

Most Roblox package managers require external registries or don't support complex dependency trees. **Vaulty** brings familiar dependency resolution to Roblox while working directly with Git repositories — no registry needed.

**Fun fact:** Vaulty was born out of frustration with setting up a private package index for Wally. Git-based dependencies solved everything!

## Features

- **Git-based dependencies**: Reference packages directly from GitHub/GitLab
- **Multiple sources**: Supports both `vaulty.toml` and `wally.toml` configs
- **Scopes**: Separate dependencies, server-dependencies, client-dependencies, and dev-dependencies
- **Lock file**: Deterministic installs with `vaulty.lock`
- **Type generation**: Automatic `.d.ts` type declaration exports
- **Redirect system**: Clean `require()` paths through `_Index` folder structure

## Quick Start

```bash
# Initialize a new project
vaulty init

# Add a dependency to vaulty.toml
# dependencies.my-package = "thecogumeta/rbx-acidsignal@^1.0.0"

# Generate lock file
vaulty lock

# Install dependencies
vaulty install

# Check for updates
vaulty info
vaulty outdated
vaulty update
```
