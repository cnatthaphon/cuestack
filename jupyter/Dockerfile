FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    jupyterlab==4.* \
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
RUN mkdir -p /home/jupyter/.jupyter /home/jupyter/.local /home/jupyter/envs

# Install ipykernel for custom environment support
# Users can create venvs and register them as Jupyter kernels
RUN pip install --no-cache-dir ipykernel

# Hide file browser, launcher, menus — platform manages notebook files
# 1. Single-document layout + disable news popup
RUN mkdir -p /home/jupyter/.jupyter/lab/user-settings/@jupyterlab/application-extension && \
    echo '{ "layout": "single-document" }' > /home/jupyter/.jupyter/lab/user-settings/@jupyterlab/application-extension/shell.jupyterlab-settings && \
    mkdir -p /home/jupyter/.jupyter/lab/user-settings/@jupyterlab/apputils-extension && \
    echo '{ "news": false }' > /home/jupyter/.jupyter/lab/user-settings/@jupyterlab/apputils-extension/notification.jupyterlab-settings && \
    mkdir -p /usr/local/share/jupyter/lab/settings && \
    echo '{ "@jupyterlab/apputils-extension:notification": { "fetchNews": "false" } }' > /usr/local/share/jupyter/lab/settings/overrides.json

# 1b. Disable hub-extension (removes Log Out / Shutdown from File menu)
RUN mkdir -p /usr/local/etc/jupyter/labconfig && \
    echo '{"disabledExtensions":{"@jupyterlab/hub-extension:plugin":true,"@jupyterlab/hub-extension:menu":true}}' \
    > /usr/local/etc/jupyter/labconfig/page_config.json

# 2. Inject CSS + JS to hide file browser/menu/hub items
COPY hide-ui.css /tmp/hide-ui.css
RUN python3 << 'PYEOF'
import glob, os
css = open('/tmp/hide-ui.css').read().replace('\n', ' ')
js = """
(function(){
  var cmds = ['hub:logout','hub:control-panel','apputils:shut-down',
              'filebrowser:open-path','filebrowser:create-main-launcher',
              'filebrowser:open','filebrowser:save-as',
              'docmanager:rename','docmanager:clone','docmanager:new-untitled',
              'notebook:create-new','launcher:create',
              'settingeditor:open','help:launch-classic-notebook',
              'application:reset-layout'];
  var hideLabels = ['log out','shut down','shutdown','hub control panel',
                    'new notebook','new launcher','open from path',
                    'save notebook as','save as','rename notebook','rename',
                    'make a copy','new file','new','settings editor',
                    'launch classic notebook','advanced settings editor'];
  function hide(){
    cmds.forEach(function(c){
      document.querySelectorAll('[data-command="'+c+'"]').forEach(function(el){
        el.style.display='none';
      });
    });
    document.querySelectorAll('.lm-Menu-item').forEach(function(el){
      var label = el.textContent.trim().toLowerCase();
      if(hideLabels.indexOf(label)!==-1){ el.style.display='none'; }
    });
    document.querySelectorAll('.lm-MenuBar-item').forEach(function(el){
      var label = el.textContent.trim().toLowerCase();
      if(label==='settings'){ el.style.display='none'; }
    });
    var tp=document.getElementById('jp-top-panel');
    if(tp){tp.style.display='none';tp.style.height='0';tp.style.minHeight='0';}
    var mp=document.getElementById('jp-menu-panel');
    if(mp && parseInt(mp.style.top)>0) mp.style.top='0px';
    var mc=document.getElementById('jp-main-content-panel');
    if(mc && parseInt(mc.style.top)>28) mc.style.top='28px';
  }
  function start(){
    if(document.body){
      new MutationObserver(hide).observe(document.body,{childList:true,subtree:true});
    } else {
      document.addEventListener('DOMContentLoaded',function(){
        new MutationObserver(hide).observe(document.body,{childList:true,subtree:true});
      });
    }
  }
  start();
  setInterval(hide, 2000);
})();
"""
tag = '<style>' + css + '</style><script>' + js.replace('\n',' ') + '</script>'
targets = glob.glob('/usr/local/**/index.html', recursive=True)
for path in targets:
    if 'jupyter' not in path.lower():
        continue
    html = open(path).read()
    if '</head>' in html:
        # Remove old injection if present
        if 'jp-SideBar' in html:
            import re
            html = re.sub(r'<style>[^<]*jp-SideBar[^<]*</style>(<script>[^<]*</script>)?', '', html)
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

# Entrypoint: fix permissions as root, then drop to jupyter user
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8888

# Start as root → entrypoint fixes permissions → drops to jupyter user
ENTRYPOINT ["/entrypoint.sh"]
