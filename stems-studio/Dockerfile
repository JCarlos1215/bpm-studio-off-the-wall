FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg python3 python3-venv ffmpeg \
    libavahi-compat-libdnssd1 libopenblas0 libgfortran5 libcap2 \
    libgl1 libx11-6 libxkbcommon0 libxkbcommon-x11-0 \
    && curl -fsSL https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb -o /tmp/keyring.deb \
    && dpkg -i /tmp/keyring.deb && apt-get update \
    && apt-get install -y --no-install-recommends \
    cuda-cudart-13-3 cuda-cudart-dev-13-3 cccl-13-3 libcublas-13-3 \
    libcufft-13-3 cuda-nvrtc-13-3 libcudnn9-cuda-13 \
    && curl -fsSL https://github.com/nsaintot/stemd/releases/download/v0.1.2/stemd_0.1.2_amd64.deb -o /tmp/stemd.deb \
    && echo 'bc544f3c3a2623a9031055fa204a1908b91a00039682ce76bde6633a006bc4fb  /tmp/stemd.deb' | sha256sum -c - \
    && dpkg-deb -x /tmp/stemd.deb / \
    && rm -rf /var/lib/apt/lists/* /tmp/*.deb
ENV NVIDIA_VISIBLE_DEVICES=all NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    CUDA_HOME=/usr/local/cuda LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/local/nvidia/lib64 \
    STEMS_REMOTE=true HOST=0.0.0.0 PORT=8421 \
    XDG_DATA_HOME=/workspace/data XDG_CACHE_HOME=/workspace/cache
WORKDIR /app
COPY requirements.txt .
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY bridge.py app.js index.html style.css ./
COPY deploy/entrypoint.sh /entrypoint.sh
EXPOSE 8421
HEALTHCHECK --start-period=10m --interval=30s --timeout=10s CMD curl -fsS http://127.0.0.1:8421/ready || exit 1
ENTRYPOINT ["bash", "/entrypoint.sh"]
