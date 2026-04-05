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
    plotly \
    scikit-learn \
    requests

# Install CueStack SDK
COPY cuestack/ /opt/cuestack/cuestack/
RUN echo 'from setuptools import setup; setup(name="cuestack", version="0.1", packages=["cuestack"])' > /opt/cuestack/setup.py && \
    pip install -e /opt/cuestack

# Create workspace directory
RUN mkdir -p /workspace

# Hide file browser, launcher, menus — platform manages notebook files
# 1. Single-document layout
RUN mkdir -p /root/.jupyter/lab/user-settings/@jupyterlab/application-extension && \
    echo '{ "layout": "single-document" }' > /root/.jupyter/lab/user-settings/@jupyterlab/application-extension/shell.jupyterlab-settings && \
    mkdir -p /root/.jupyter/lab/user-settings/@jupyterlab/apputils-extension && \
    echo '{ "news": false }' > /root/.jupyter/lab/user-settings/@jupyterlab/apputils-extension/notification.jupyterlab-settings

# 2. Inject CSS to hide file browser/menu into ALL index.html files JupyterLab uses
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
RUN mkdir -p /root/.jupyter
COPY jupyter_config.py /root/.jupyter/jupyter_lab_config.py
COPY startup.py /root/.jupyter/startup.py

WORKDIR /workspace

EXPOSE 8888

CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--allow-root"]
