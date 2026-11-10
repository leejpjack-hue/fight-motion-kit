# Cloud Agent image for fight-motion-kit plus nested Docker (HM-PF-49 n8n).
# Cursor checks the repo out after this image builds. Do not COPY the repository.
#
# Nested Docker follows https://cursor.com/docs/cloud-agent/setup#running-docker
# (fuse-overlayfs + iptables-legacy). The doc snippet pins docker-ce 5:28.5.2,
# which is still in the noble repo. This image pins 5:29.9.3, the noble stable
# that installed and passed `docker run hello-world` on the spike VM (2026-11-09).

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        git \
        python3 \
        xz-utils \
        iptables \
        fuse-overlayfs \
    && rm -rf /var/lib/apt/lists/*

# Node 22 for `npm test` (node --test). Login shells must see it on the default PATH.
ARG NODE_VERSION=22.23.4
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1 --no-same-owner

RUN install -m 0755 -d /etc/apt/keyrings \
    && curl --retry 3 --retry-delay 5 -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        docker-ce=5:29.9.3-1~ubuntu.24.04~noble \
        docker-ce-cli=5:29.9.3-1~ubuntu.24.04~noble \
        containerd.io \
        docker-buildx-plugin \
        docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/docker \
    && printf '%s\n' '{' \
        '  "storage-driver": "fuse-overlayfs"' \
        '}' > /etc/docker/daemon.json \
    && update-alternatives --set iptables /usr/sbin/iptables-legacy \
    && update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy

# ubuntu already exists on ubuntu:24.04. Password login stays off; sudo is NOPASSWD.
RUN mkdir -p /etc/ssh/sshd_config.d \
    && printf '%s\n' \
        'PasswordAuthentication no' \
        'ChallengeResponseAuthentication no' \
        'UsePAM no' \
        > /etc/ssh/sshd_config.d/disable_password_auth.conf \
    && id -u ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu \
    && groupadd -f docker \
    && usermod -aG docker ubuntu \
    && usermod -aG sudo ubuntu \
    && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 440 /etc/sudoers.d/ubuntu

USER ubuntu
