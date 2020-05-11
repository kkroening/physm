import argparse
import soculus

parser = argparse.ArgumentParser()
parser.add_argument('socket_file')

if __name__ == '__main__':
    args = parser.parse_args()
    soculus.run_connector(args.socket_file)
