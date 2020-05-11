import matplotlib
matplotlib.use('Agg')

#from .sims.blocksprings import main
from .sims.pendulumcart import main
import logging

logging.basicConfig(level=logging.INFO)
main()
