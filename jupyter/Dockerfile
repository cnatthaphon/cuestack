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

# Inject custom CSS into JupyterLab's index.html to hide file management UI
RUN LABSTATIC=$(python -c "import jupyterlab; import os; print(os.path.join(os.path.dirname(jupyterlab.__file__), 'static'))") && \
    cp "$LABSTATIC/index.html" "$LABSTATIC/index.html.bak" && \
    sed -i 's|</head>|<style>\
/* Platform-managed: hide file browser sidebar, menu bar, launcher */\
.jp-SideBar.jp-mod-left, #jp-left-stack { display:none!important; }\
#jp-menu-panel, #jp-MainMenu { display:none!important; }\
.jp-Launcher { display:none!important; }\
.jp-SideBar.jp-mod-right { display:none!important; }\
</style></head>|' "$LABSTATIC/index.html"

# Jupyter config
RUN mkdir -p /root/.jupyter
COPY jupyter_config.py /root/.jupyter/jupyter_lab_config.py
COPY startup.py /root/.jupyter/startup.py

WORKDIR /workspace

EXPOSE 8888

CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--allow-root"]
