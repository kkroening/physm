## Setup

```bash
virtualenv venv -p $(which python3)
. venv/bin/activate
pip install -e .
jupyter labextension install @jupyter-widgets/jupyterlab-manager
jupyter labextension install jupyter-matplotlib
```

## Execution

```bash
. venv/bin/activate
jupyter lab
```
