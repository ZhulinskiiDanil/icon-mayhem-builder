# Builds Geode mods for Windows (cross-compiled with clang-cl) and Android on Linux.
# The heavy, slow-changing parts (the Android NDK, the Geode SDK, the Windows SDK, caches) live on
# the volume at /data, set up by scripts/setup.sh on the first build.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget gnupg lsb-release software-properties-common \
      git unzip xz-utils ninja-build ccache jq python3 file \
    && rm -rf /var/lib/apt/lists/*

# Clang/LLD 21: Geode needs 19 at least, 21 is recommended
RUN wget -qO /tmp/llvm.sh https://apt.llvm.org/llvm.sh \
    && bash /tmp/llvm.sh 21 \
    && apt-get install -y --no-install-recommends clang-tools-21 lld-21 llvm-21 \
    && rm -rf /var/lib/apt/lists/* /tmp/llvm.sh \
    && for tool in clang clang++ clang-cl lld lld-link ld.lld llvm-ar llvm-nm llvm-mt llvm-rc llvm-lib llvm-ranlib llvm-dlltool llvm-objcopy llvm-strip; do \
         if [ -e "/usr/bin/$tool-21" ]; then ln -sf "/usr/bin/$tool-21" "/usr/local/bin/$tool"; fi; \
       done

# CMake 3.29 at least (Ubuntu 24.04 has 3.28)
ARG CMAKE_VERSION=3.31.6
RUN curl -fsSL "https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz" \
      | tar -xz -C /opt \
    && ln -sf /opt/cmake-${CMAKE_VERSION}-linux-x86_64/bin/* /usr/local/bin/

# Geode CLI
ARG GEODE_CLI_VERSION=3.9.0
RUN curl -fsSL -o /tmp/cli.zip "https://github.com/geode-sdk/cli/releases/download/v${GEODE_CLI_VERSION}/geode-cli-v${GEODE_CLI_VERSION}-linux.zip" \
    && unzip -q /tmp/cli.zip -d /usr/local/bin \
    && chmod +x /usr/local/bin/geode \
    && rm /tmp/cli.zip

# Node for the server
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev && chmod +x scripts/*.sh

ENV DATA_DIR=/data
CMD ["node", "dist/index.js"]
