from collections import deque
import argparse
import gym
import json
import logging
import numpy as np
import os
import pandas as pd
import random
import re
import tensorflow as tf


DEFAULT_CHECKPOINT_INTERVAL = 50  # 1000
DEFAULT_TRIALS = 1000

CHECKPOINT_FILENAME_PATTERN = re.compile(r'.*-checkpoint(?P<trial>[0-9]+)\.json')
N_ACTIONS = 2
N_OBSERVATIONS = 4
MAX_TIME = 200

parser = argparse.ArgumentParser()

# Top-level args:
parser.add_argument('out_file', help='Output file')
parser.add_argument(
    '-y', action='store_true', help='Don\'t prompt; always assume the answer is yes'
)
parser.add_argument(
    '--checkpoint-interval',
    help='Number of steps between checkpoints',
    default=DEFAULT_CHECKPOINT_INTERVAL,
)
parser.add_argument('--trials', type=int, default=DEFAULT_TRIALS)

logger = logging.getLogger(__name__)


class Model(object):
    DEFAULT_GAMMA = 0.95
    DEFAULT_LEARNING_RATE = 0.001
    DEFAULT_BATCH_SIZE = 200
    DEFAULT_MEMORY_SIZE = 1000000
    DEFAULT_EXPLORATION_MAX = 1.0
    DEFAULT_EXPLORATION_MIN = 0.01
    DEFAULT_EXPLORATION_DECAY = 0.998

    PARAM__BATCH_SIZE = 'batch-size'
    PARAM__EXPLORATION_DECAY = 'exploration-decay'
    PARAM__EXPLORATION_MAX = 'exploration-max'
    PARAM__EXPLORATION_MIN = 'exploration-min'
    PARAM__GAMMA = 'gamma'
    PARAM__LEARNING_RATE = 'learning-rate'
    PARAM__MEMORY_SIZE = 'memory-size'
    PARAMS = [
        PARAM__BATCH_SIZE,
        PARAM__EXPLORATION_DECAY,
        PARAM__EXPLORATION_MAX,
        PARAM__EXPLORATION_MIN,
        PARAM__GAMMA,
        PARAM__LEARNING_RATE,
        PARAM__MEMORY_SIZE,
    ]

    @classmethod
    def get_parser(cls):
        parser = argparse.ArgumentParser(add_help=False)
        parser.add_argument('--batch-size', type=int)
        parser.add_argument('--exploration-decay', type=float)
        parser.add_argument('--exploration-max', type=float)
        parser.add_argument('--exploration-min', type=float)
        parser.add_argument('--gamma', type=float)
        parser.add_argument('--learning-rate', type=float)
        parser.add_argument('--memory-size', type=int)
        return parser

    @classmethod
    def get_params_from_args(cls, args):
        params = {
            cls.PARAM__EXPLORATION_DECAY: args.exploration_decay,
            cls.PARAM__EXPLORATION_MAX: args.exploration_max,
            cls.PARAM__EXPLORATION_MIN: args.exploration_min,
            cls.PARAM__GAMMA: args.gamma,
            cls.PARAM__LEARNING_RATE: args.learning_rate,
        }
        return {k: v for k, v in params.items() if v is not None}

    def __init__(self, params):
        self.params = params.copy()
        self.tf_model = tf.keras.models.Sequential(
            [
                tf.keras.layers.Dense(
                    20, input_shape=(N_OBSERVATIONS,), activation='relu'
                ),
                tf.keras.layers.Dense(20, activation='relu'),
                tf.keras.layers.Dense(N_ACTIONS, activation='linear'),
            ]
        )
        self.tf_model.compile(
            optimizer=tf.keras.optimizers.Adam(
                learning_rate=params[PARAM__LEARNING_RATE]
            ),
            loss='mse',
            metrics=['accuracy'],
        )
        self.exploration = params[PARAM__EXPLORATION_MAX]
        self.memories = deque(maxlen=params[PARAM__MEMORY_SIZE])

    def import_state(self, model_state):
        assert isinstance(model_state, dict)
        assert model_state.keys() == {'weights', 'exploration', 'memories'}
        weights = model_state['weights']
        var_dict = {x.name: x for x in self.tf_model.trainable_variables}
        if weights.keys() != var_dict.keys():
            raise ValueError(
                'Imported weights have incorrect set of variables; expected {}; got {}'.format(
                    ', '.join(var_dict.keys(), weights.keys())
                )
            )
        for key, value in weights.items():
            var_dict[key].assign(value)
        self.memories.clear()
        self.memories += model_state['memories']

    def export_state(self):
        return {v.name: v.numpy() for v in self.tf_model.trainable_variables}

    def select_action(self, state, params):
        if np.random.rand() < params['exploration_rate']:
            action = random.randrange(N_ACTIONS)
        else:
            q_values = self.tf_model.predict(state[np.newaxis, :])
            action = np.argmax(q_values[0])
        return action

    def _remember(self, state, action, reward, next_state, done):
        self.memories.append(
            {
                'state': state,
                'action': action,
                'reward': reward,
                'next_state': next_state,
                'done': done,
            }
        )

    @staticmethod
    def _get_updated_q_value(action, reward, done, q_value1, q_value2, params):
        if done:
            q_update = -10
        else:
            q_update = reward + params[PARAM__GAMMA] * np.argmax(q_value2)
        new_q_value = q_value1.copy()
        new_q_value[action] = q_update
        return new_q_value

    def _replay_memories(self):
        batch_size = self.params[PARAM__BATCH_SIZE]
        if len(memories) >= batch_size:
            memory_batch = random.sample(memories, batch_size)
            states = [x['state'] for x in memory_batch]
            next_states = [x['next_state'] for x in memory_batch]
            predictions = self.tf_model.predict(np.vstack((states, next_states)))
            q_values1 = predictions[: len(states)]
            q_values2 = predictions[len(states) :]
            new_q_values = []
            for memory, q_value1, q_value2 in zip(memory_batch, q_values1, q_values2):
                action = memory['action']
                reward = memory['reward']
                done = memory['done']
                new_q_values += [
                    self.get_updated_q_value(action, reward, done, q_value1, q_value2)
                ]
            self.tf_model.fit(np.array(states), np.array(new_q_values), verbose=0)

    def observe(self, state, action, reward, next_state, done):
        self._remember(state, action, reward, next_state, done)
        self._replay_memories(model, memories, params)
        if len(memories) >= self.params[PARAM__BATCH_SIZE]:
            self.exploration_rate *= params[PARAM__EXPLORATION_DECAY]
            self.exploration_rate = max(
                params[PARAM__EXPLORATION_MIN], self.exploration_rate
            )

    def get_event_metadata(self):
        return {'exploration': self.exploration}


def flatten_state(state):
    return {f'observation{i}': x for i, x in enumerate(state)}


def run_trial(env, model, tqdm_func=None):
    tqdm_func = tqdm_func or (lambda x: x)
    state = env.reset()
    events = []
    for i in tqdm_func(range(MAX_TIME)):
        action = model.select_action(state)
        next_state, reward, done, info = env.step(action)
        model.observe(state, action, reward, next_state, done)
        events.append(
            {
                **flatten_state(state),
                'action': action,
                'reward': reward,
                'done': done,
                **model.get_event_metadata(),
            }
        )
        state = next_state
        if done:
            break
    return events


def thing():
    rows = []
    for trial in range(len(states)):
        for step in range(len(states[trial])):
            row = {
                'trial': trial,
                'step': step,
                'reward': rewards[trial][step],
                'done': dones[trial][step],
            }
            for k, state in enumerate(states[trial][step]):
                row[f'observation{k}'] = state
            rows.append(row)
    pd.DataFrame(rows)


def find_checkpoint_file(out_filename):
    base_filename, _ = os.path.splitext(out_filename)
    filename_map = {}
    base_dir = os.path.dirname(out_filename)
    logger.info(f'Scanning for checkpoint files in directory: {base_dir}')
    for filename in os.listdir(base_dir):
        try:
            match = CHECKPOINT_FILENAME_PATTERN.match(filename)
            trial = int(match.group('trial'))
            filename_map[trial] = filename
        except:
            pass
    if filename_map:
        trial = max(filename_map.keys())
        filename = filename_map[trial]
        logger.info(f'Checkpoint file found: {filename}')
    else:
        filename = None
        logger.info('Checkpoint file not found')
    return filename


def load_checkpoint(filename, expected_params):
    assert filename is not None
    logger.info(f'Loading checkpoint file: {filename}')
    with open(filename) as f:
        checkpoint = json.load(f)
    expected_keys = {'model', 'params', 'trial'}
    missing_keys = expected_keys - checkpoint.keys()
    if missing_keys:
        raise ValueError(
            'Checkpoint is missing key(s): {}'.format(', '.join(missing_keys))
        )
    if checkpoint['params'] != expected_params:
        raise ValueError(
            'Checkpoint parameters mismatch expected parameters; expected {}; got {}'.format(
                json.dumps(expected_params, sort_keys=True),
                json.dumps(checkpoint['params'], sort_keys=True),
            )
        )
    return checkpoint


def save_checkpoint(filename, weights, params):
    pass


def main():
    """
    Todo:
     - if starting from scratch (file doesn't exist):
       - create file
       - emit params
       - emit header
       - keep file open
     - else picking up from previous (file exists):
       - read file
       - load params
       - load most recent model snaphsot
       - load events
       - discard events newer than most recent model snapshot
       - initialize counters to most recent snapshot
       - write truncated events file; keep file open
     - emit events
        - TBD: whether to emit stream of events or emit all at once with checkpoints
        - TBD: whether to log events into one big file or a bunch of little files
     - log progress (stderr)
     - snapshot model weights every so often
    """
    args = parser.parse_args()
    args.add_subparser_or_whatever(Model.get_parser())
    params = Model.get_params_from_args(args)
    model = Model(params)
    checkpoint_filename = find_checkpoint_file(args.out_file)
    trial = 0
    if checkpoint_filename is not None:
        checkpoint = load_checkpoint(checkpoint_filename)
        model.import_state(checkpoint['model_state'])
        trial = checkpoint['trial']
    env = gym.make('CartPole-v1')
    with open(args.out_file, 'a') as out_file:
        for trial in range(trial, args.trials):
            print(
                'Trial {}   (exploration rate: {})'.format(
                    trial, params['exploration_rate']
                )
            )
            events = run_trial(env, model)
            pd.DataFrame(events).to_csv(out_file)
