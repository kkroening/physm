package us.kralnet.redgen;

import java.util.LinkedList;
import java.util.List;

/** A redstone net containing one or more inputs and one or more outputs, along
 *  with information about all redstone wires that the net consists of.
 */
class Net {
    static class Wire {
        int x;
        int y;
        int z;
        boolean isRepeater;
        int latency;

        Wire(int x, int y, int z, boolean isRepeater, int latency) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.isRepeater = isRepeater;
        }
    }

    static class Terminal {
        int x;
        int y;
        int z;

        Terminal(int x, int y, int z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }

    private List<Wire> wires;
    private List<Terminal> inputTerminals;
    private List<Terminal> outputTerminals;

    Net() {
        wires = new LinkedList<Wire>();
        inputTerminals = new LinkedList<Terminal>();
        outputTerminals = new LinkedList<Terminal>();
    }

    List<Terminal> getInputTerminals() {
        return inputTerminals;
    }

    List<Terminal> getOutputTerminals() {
        return outputTerminals;
    }

    int getInputTerminalCount() {
        return inputTerminals.size();
    }

    int getOutputTerminalCount() {
        return outputTerminals.size();
    }

    void addWire(Wire wire) {
        wires.add(wire);
    }

    void addInputTerminal(int x, int y, int z) {
        inputTerminals.add(new Terminal(x, y, z));
    }

    void addOutputTerminal(int x, int y, int z) {
        outputTerminals.add(new Terminal(x, y, z));
    }

    /** Calculate block distance via L1 norm (Manhattan distance).
     */
    static int getDistance(int x1, int y1, int z1, int x2, int y2, int z2) {
        return Math.abs(x2 - x1) + Math.abs(y2 - y1) + Math.abs(z2 - z1);
    }

    Wire findClosestWire(int x, int y, int z) {
        Wire closest = null;
        int closestDist = -1;
        for (Wire wire: wires) {
            int dist = getDistance(x, y, z, wire.x, wire.y, wire.z);
            if (closest == null || dist < closestDist) {
                closest = wire;
                closestDist = dist;
            }
        }
        return closest;
    }

    Terminal getInputTerminal(int x, int y, int z) {
        for (Terminal terminal : inputTerminals) {
            if (terminal.x == x && terminal.y == y && terminal.z == z) {
                return terminal;
            }
        }
        return null;
    }

    Terminal getOutputTerminal(int x, int y, int z) {
        for (Terminal terminal : outputTerminals) {
            if (terminal.x == x && terminal.y == y && terminal.z == z) {
                return terminal;
            }
        }
        return null;
    }

    Wire getWire(int x, int y, int z) {
        for (Wire wire : wires) {
            if (wire.x == x && wire.y == y && wire.z == z) {
                return wire;
            }
        }
        return null;
    }
}
