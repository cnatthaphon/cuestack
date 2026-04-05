FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    jupyterlab==4.* \
    jupyter-server-proxy \
    psycopg2-binary \
    sqlalchemy \
    pandas \
    numpy \
    matplotlib \
    seaborn \
    plotly \
    scikit-learn \
    scipy \
    requests \
    httpx

# Install CueStack SDK (system-wide, read-only for users)
COPY cuestack/ /opt/cuestack/cuestack/
RUN echo 'from setuptools import setup; setup(name="cuestack", version="0.1", packages=["cuestack"])' > /opt/cuestack/setup.py && \
    pip install -e /opt/cuestack

# --- Security: create unprivileged user ---
RUN groupadd -r jupyter && useradd -r -g jupyter -m -d /home/jupyter jupyter

# Create workspace directory owned by jupyter user
RUN mkdir -p /workspace && chown -R jupyter:jupyter /workspace

# Jupyter config directory for the jupyter user
RUN mkdir -p /home/jupyter/.jupyter /home/jupyter/.local

# Hide file browser, launcher, menus — platform manages notebook files
# 1. Single-document layout + disable news popup
RUN mkdir -p /home/jupyter/.jupyter/lab/user-settings/@jupyterlab/application-extension && \
    echo '{ "layout": "single-document" }' > /home/jupyter/.jupyter/lab/user-settings/@jupyterlab/application-extension/shell.jupyterlab-settings && \
    mkdir -p /home/jupyter/.jupyter/lab/user-settings/@jupyterlab/apputils-extension && \
    echo '{ "news": false }' > /home/jupyter/.jupyter/lab/user-settings/@jupyterlab/apputils-extension/notification.jupyterlab-settings && \
    mkdir -p /usr/local/share/jupyter/lab/settings && \
    echo '{ "@jupyterlab/apputils-extension:notification": { "fetchNews": "false" } }' > /usr/local/share/jupyter/lab/settings/overrides.json

# 2. Inject CSS to hide file browser/menu/shutdown
COPY hide-ui.css /tmp/hide-ui.css
RUN python3 << 'PYEOF'
import glob, os
css = open('/tmp/hide-ui.css').read().replace('\n', ' ')
tag = '<style>' + css + '</style>'
targets = glob.glob('/usr/local/**/index.html', recursive=True)
for path in targets:
    if 'jupyter' not in path.lower():
        continue
    html = open(path).read()
    if '</head>' in html and 'jp-SideBar' not in html:
        html = html.replace('</head>', tag + '</head>')
        open(path, 'w').write(html)
        print(f'Injected into {path}')
PYEOF

# Jupyter config
COPY jupyter_config.py /home/jupyter/.jupyter/jupyter_lab_config.py
COPY startup.py /home/jupyter/.jupyter/startup.py

# Set ownership
RUN chown -R jupyter:jupyter /home/jupyter

# Make system dirs read-only for jupyter user (can't modify installed packages)
RUN chmod -R o-w /usr/local/lib/python3.12/site-packages/ 2>/dev/null || true

WORKDIR /workspace

# Switch to unprivileged user — can only write to /workspace and /home/jupyter
USER jupyter

EXPOSE 8888

CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser"]
