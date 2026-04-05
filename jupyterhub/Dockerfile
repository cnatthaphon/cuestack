FROM jupyterhub/jupyterhub:4

RUN pip install --no-cache-dir \
    dockerspawner \
    jupyterhub-idle-culler \
    requests

COPY jupyterhub_config.py /srv/jupyterhub/jupyterhub_config.py

RUN mkdir -p /data

EXPOSE 8000

CMD ["jupyterhub", "-f", "/srv/jupyterhub/jupyterhub_config.py"]
