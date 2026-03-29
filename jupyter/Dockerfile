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

# Install IoT Stack SDK
COPY iot_stack/ /opt/iot_stack/iot_stack/
RUN echo 'from setuptools import setup; setup(name="iot_stack", version="0.1", packages=["iot_stack"])' > /opt/iot_stack/setup.py && \
    pip install -e /opt/iot_stack

# Create workspace directory
RUN mkdir -p /workspace

# Hide file browser, launcher, menus — platform manages notebook files
# Single-document layout as default
RUN mkdir -p /root/.jupyter/lab/user-settings/@jupyterlab/application-extension && \
    echo '{ "layout": "single-document" }' > /root/.jupyter/lab/user-settings/@jupyterlab/application-extension/shell.jupyterlab-settings

# Inject custom CSS into JupyterLab's template to hide file management UI
RUN TMPL="/usr/local/lib/python3.12/site-packages/jupyterlab_server/templates/index.html" && \
    sed -i 's|</head>|<style>\
.jp-SideBar.jp-mod-left{display:none!important}\
#jp-menu-panel,#jp-MainMenu{display:none!important}\
.jp-Launcher{display:none!important}\
.jp-SideBar.jp-mod-right{display:none!important}\
</style>\n</head>|' "$TMPL"

# Jupyter config
RUN mkdir -p /root/.jupyter
COPY jupyter_config.py /root/.jupyter/jupyter_lab_config.py
COPY startup.py /root/.jupyter/startup.py

WORKDIR /workspace

EXPOSE 8888

CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--allow-root"]
