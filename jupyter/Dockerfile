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

# Disable file browser, launcher, and new file creation — platform manages files
RUN jupyter labextension disable @jupyterlab/filebrowser-extension:browser && \
    jupyter labextension disable @jupyterlab/launcher-extension:launcher && \
    jupyter labextension disable @jupyterlab/filebrowser-extension:open-with && \
    jupyter labextension disable @jupyterlab/filebrowser-extension:share-file && \
    jupyter labextension disable @jupyterlab/filebrowser-extension:download && \
    jupyter labextension disable @jupyterlab/filebrowser-extension:factory-default

# Jupyter config
RUN mkdir -p /root/.jupyter
COPY jupyter_config.py /root/.jupyter/jupyter_lab_config.py
COPY startup.py /root/.jupyter/startup.py

WORKDIR /workspace

EXPOSE 8888

CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--allow-root"]
