package us.kralnet.redgen;

import java.util.HashMap;
import java.util.List;
import java.util.PriorityQueue;

import cpw.mods.fml.relauncher.FMLRelaunchLog;

import us.kralnet.redgen.Net.Wire;

import net.minecraft.block.Block;
import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.init.Blocks;
import net.minecraft.util.ChatComponentText;
import net.minecraft.world.World;

public class RouteCommand extends CommandBase {
    private static void log(String message) {
        //FMLRelaunchLog.info(message);
    }

    private static void log2(String message) {
        FMLRelaunchLog.info(message);
    }

    @Override
    public String getCommandName() {
        return "route";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "";
    }

    private int debugMinX;
    private int debugMinY;
    private int debugMinZ;
    private int debugCutoff;

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            PlayerInfo info = RedGen.getInstance().getPlayerInfo(player);
            PlayerInfo.Position pos1 = info.getPosFloor(1);
            PlayerInfo.Position pos2 = info.getPosFloor(2);
            PlayerInfo.Position pos3 = info.getPosFloor(3);
            if (pos1 == null || pos2 == null) {
                player.addChatMessage(new ChatComponentText("Please specify positions with /pos1 and /pos2."));
            } else {
                Net net = new Net();
                int minx = (int) Math.min(pos1.x, pos2.x);
                int miny = (int) Math.min(pos1.y, pos2.y);
                int minz = (int) Math.min(pos1.z, pos2.z);
                int maxx = (int) Math.max(pos1.x, pos2.x);
                int maxy = (int) Math.max(pos1.y, pos2.y);
                int maxz = (int) Math.max(pos1.z, pos2.z);
                minx -= 10;
                miny -= 2;
                minz -= 10;
                maxx += 10;
                maxz += 10;
                maxy += 8;
                net.addInputTerminal((int) pos1.x - minx, (int) pos1.y - miny, (int) pos1.z - minz);
                net.addOutputTerminal((int) pos2.x - minx, (int) pos2.y - miny, (int) pos2.z - minz);
                if (pos3 != null) {
                    net.addOutputTerminal((int) pos3.x - minx, (int) pos3.y - miny, (int) pos3.z - minz);
                }
                this.debugMinX = minx;
                this.debugMinY = miny;
                this.debugMinZ = minz;
                debugCutoff = 1000000;
                for (int i = 0; i < params.length; i++) {
                    if (params[i].equals("r")) {
                        RedGen.getInstance().getTransactionManager().undoTransaction();
                    } else {
                        debugCutoff = Integer.parseInt(params[i]);
                    }
                }
                BlockBuffer buffer = new BlockBuffer(sender.getEntityWorld(), minx, miny, minz, maxx, maxy, maxz);
                if (!route(buffer, net)) {
                    player.addChatMessage(new ChatComponentText("Routing failed!"));
                } else {
                    buffer.transfer(player.getEntityWorld(), minx, miny, minz, RedGen.getInstance().getTransactionManager());
                    player.addChatMessage(new ChatComponentText("Routing successful"));
                }
            }
        }
    }

    /** Route wires in order to connect terminals of a net.
     *
     * A net may have a single output and one or more inputs, or a single input
     * and one or more outputs; in other words, the case of multiple inputs and
     * multiple outputs is not supported.  If multiple inputs and outputs need
     * to be routed on a single net then the net needs to be broken up so that
     * the inputs merge at a single point and then fan out to the output
     * terminals.  The reason for this is that otherwise feedback loops may be
     * formed with redstone repeaters.
     *
     * The high-level routing strategy is as follows: if there are multiple
     * inputs, route the first input terminal to the output terminal by finding
     * the shortest path.  Then, for each additional input route the wire by
     * finding the shortest path to either the output terminal or the existing
     * wire that was placed for the first or subsequent routes.  If instead
     * there are multiple outputs, then simply reverse the process so that the
     * first output is routed to the input, then subsequent outputs are routed
     * to the input in turn.
     *
     * A* search is performed to find shortest paths, and the Manhattan block
     * distance is used as a heuristic.
     *
     * Some lower-level details are as follows:
     *  - The block buffer is updated each time a route is found for a
     *    terminal; on the other hand, the block buffer is not modified at all
     *    during the search process.
     *  - Wires are not added to the net's wire list until they appear in the
     *    block buffer.  This allows Net.getClosestWire() to return sane
     *    results as a search heuristic (rather than returning the wire that
     *    was placed last, which would just be stupid).
     *  - Because redstone repeaters have slightly different behavior than
     *    ordinary redstone wire, one wire location may represent more than
     *    one state in the state space.
     */
    private boolean route(BlockBuffer buffer, Net net) {
        boolean reverse;
        int inputCount = net.getInputTerminalCount();
        int outputCount = net.getOutputTerminalCount();
        if (inputCount == 0 || outputCount == 0 || (inputCount != 1 && outputCount != 1)) {
            return false;
        }
        List<Net.Terminal> sources;
        Net.Terminal dest;
        if (outputCount == 1) {
            sources = net.getInputTerminals();
            dest = net.getOutputTerminals().get(0);
            reverse = false;
        } else {
            sources = net.getOutputTerminals();
            dest = net.getInputTerminals().get(0);
            reverse = true;
        }
        for (Net.Terminal source : sources) {
            if (!route(buffer, net, source, dest, reverse)) {
                return false;
            }
        }

        buffer.setBlock(0, 0, 0, Blocks.stone, 0);
        return true;
    }

    private class Node implements Comparable<Node> {
        double totalCost;
        int lengthSinceLastRepeater;
        Net.Wire wire;
        Node parent;

        Node(double totalCost, Net.Wire wire, Node parent) {
            this.totalCost = totalCost;
            this.wire = wire;
            this.parent = parent;
            if (wire.isRepeater) {
                lengthSinceLastRepeater = 0;
            } else if (parent != null) {
                lengthSinceLastRepeater = parent.lengthSinceLastRepeater + 1;
            }
        }

        public int compareTo(Node other) {
            if (totalCost < other.totalCost) {
                return -1;
            } else if (totalCost > other.totalCost) {
                return 1;
            } else {
                return 0;
            }
        }
    }

    /** Determine whether a block type can have redstone stuff rubbed all over
     *  it.
     *
     * FIXME: Obviously incomplete list...
     */
    private boolean isPlaceableSurface(Block block) {
        return     block == Blocks.stone
                || block == Blocks.grass
                || block == Blocks.dirt
                || block == Blocks.cobblestone
                || block == Blocks.sandstone;
    }

    private boolean isInPath(Node node, int x, int y, int z, boolean checkAbove, boolean checkBelow) {
        for (Node n = node; n != null; n = n.parent) {
            if (x == n.wire.x && (y == n.wire.y || y == n.wire.y - 1 || y == n.wire.y + 1) && z == n.wire.z) {
                if (y == n.wire.y) {
                    return true;
                } else if (checkBelow && y-1 == n.wire.y) {
                    return true;
                } else if (checkAbove && y+1 == n.wire.y) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Determines whether the sepcified coordinates are an acceptable location
     *  for a wire to be placed.
     *
     * A location is acceptable if all of the following are true:
     *  - The location is inside the buffer, above the bottom level.
     *  - The location is not a wire in the frontier node's path.
     *  - The location is empty.
     *  - The location below is empty and safe to place a block, or it
     *    contains a block that redstone wire can be placed on.
     *  - Any adjacent wire or repeater is the parent wire (this includes
     *    blocks above or below in certain cases).
     *  - There's a clear signal from the parent wire to the location.
     */
    private boolean canPlaceWire(BlockBuffer buffer, Net net, Node node, Net.Terminal dest, int x, int y, int z) {
        if (!buffer.isInRange(x, y, z) || y == 0) {
            //log("Out of buffer");
            return false;
        } else if (isInPath(node, x, y, z, true, true)) {
            //log("in path");
            return false;
        } else if (buffer.getBlock(x, y, z).block != Blocks.air && !isDest(x, y, z, buffer, net, dest)) {
            // We should only deal with empty blocks, unless it's the destination.
            return false;
        }

        // Make sure we can place a block under the spot.  If there's a
        // redstone torch below where we'd place a block the redstone torch
        // would send a signal that would interfere with the wire we want to
        // place.
        Block blockBelow = buffer.getBlock(x, y-1, z).block;
        if (blockBelow != Blocks.air && !isPlaceableSurface(blockBelow)) {
            log("non-placeable surface below");
            return false;
        } else if (y == 1) {
            // The block below it is outside of the buffer, so assume it's
            // safe.
        } else {
            Block blockBelowBelow = buffer.getBlock(x, y-2, z).block;
            if (blockBelowBelow == Blocks.redstone_torch || blockBelowBelow == Blocks.unlit_redstone_torch) {
                log("torch below block");
                return false;
            } else if (blockBelowBelow == Blocks.redstone_wire || isInPath(node, x, y-2, z, false, false)) {
                // Prevent cutting off incline signals by this somewhat overkill
                // method. Relax this restriction later if possible.
                return false;
            }
        }

        // Grab blockAbove for later use.
        Block blockAbove = buffer.getBlock(x, y+1, z).block;

        log("trying " + getCoordText(x, y, z) +", parent: " + getCoordText(node.wire.x, node.wire.y, node.wire.z));

        // Directly adjacent signals are bad (unless it's the parent signal or
        // a destination), and adjacent signals that are one block above or one
        // block below can also cause problems, so check each direction.  Also
        // make sure the parent signal is reachable.
        boolean foundParent = false;
        for (int i = 0; i < 4; i++) {
            int x2 = x;
            int z2 = z;
            switch (i) {
            case 0:
                x2++;
                break;
            case 1:
                x2--;
                break;
            case 2:
                z2--;
                break;
            case 3:
                z2++;
                break;
            }

            log("  checking " + getCoordText(x2, y, z2));

            if (!buffer.isInRange(x2, y, z2)) {
                continue;
            }

            Block blockAdj = buffer.getBlock(x2, y, z2).block;
            if (node.wire.x == x2 && node.wire.y == y && node.wire.z == z2) {
                // Parent is adjacent.
                foundParent = true;
            } else if (blockAdj == Blocks.air) {
                // Check adjacent-below for a signal.
                Block blockBelowAdj = buffer.getBlock(x2, y-1, z2).block;
                if (blockBelowAdj == Blocks.redstone_wire) {
                    return false;
                } else if (node.wire.x == x2 && node.wire.y == y-1 && node.wire.z == z2) {
                    // Parent is adjacent-below.
                    foundParent = true;
                } else if (isInPath(node, x2, y, z2, true, true)) {
                    return false;
                }

                // Check adjacent-above for a signal.
                Block blockAboveAdj = buffer.getBlock(x2, y+1, z2).block;
                if (node.wire.x == x2 && node.wire.y == y+1 && node.wire.z == z2) {
                    // Parent is adjacent-above.
                    foundParent = true;
                }
            } else if (blockAdj == Blocks.redstone_wire || blockAdj == Blocks.powered_repeater || blockAdj == Blocks.unpowered_repeater) {
                // Found an adjacent wire that's not ours.
                log("found foreign adjacent wire");
                return false;
            } else if (blockAdj == Blocks.redstone_torch || blockAdj == Blocks.unlit_redstone_torch || blockAdj == Blocks.powered_comparator || blockAdj == Blocks.unpowered_comparator) {
                // Definitely not ours.. we don't generate any of these in routing.
                log("found weird other redstone stuff");
                return false;
            } else if (isPlaceableSurface(blockAdj)) {
                // Check adjacent-above for a signal, but only if there's no
                // block above us to obstruct it.  FIXME: Also check spots that
                // are adjacent to the block in case there's a rogue repeater
                // on the other side, which mysteriously sends signals through
                // blocks.
                if (blockAbove == Blocks.air) {
                    Block blockAboveAdj = buffer.getBlock(x2, y+1, z2).block;
                    if (blockAboveAdj == Blocks.redstone_wire) {
                        return false;
                    } else if (node.wire.x == x2 && node.wire.y == y+1 && node.wire.z == z2) {
                        // Parent is adjacent-above.
                        foundParent = true;
                    } else if (isInPath(node, x2, y+1, z2, false, false)) {
                        return false;
                    }
                }
            }
        }

        if (!foundParent) {
            // Parent is not reachable. Ruh roh.
            //log2("couldn't find parent");
            return false;
        }

        log("huzzah! " + getCoordText(x, y, z) + " is good");
        // Wow, we made it this far despite all the things that could have gone
        // wrong above?
        return true;
    }

    /** Determine whether a location is a destination.
     *
     * A location is a destination if it's a destination terminal or part of
     * the already placed route to the destination.
     */
    private boolean isDest(int x, int y, int z, BlockBuffer buffer, Net net, Net.Terminal dest) {
        if (x == dest.x && y == dest.y && z == dest.z) {
            return true;
        }
        Block block = buffer.getBlock(x, y, z).block;
        if ((block == Blocks.redstone_wire || block == Blocks.powered_repeater || block == Blocks.unpowered_repeater) && net.getWire(x, y, z) != null) {
            return true;
        } else {
            return false;
        }
    }

    /** Place wires and blocks in buffer and net from a solution path that's
     *  benn found.
     *
     * This skips the first and last nodes in the node hierarchy, since they
     * refer to the source and destination (respectively), which are merely
     * markers rather than places where wire should be physically placed.
     */
    private void commitRoute(BlockBuffer buffer, Net net, Node solution, boolean skipFirst) {
        log("Committing solution");
        for (Node n = solution; n != null && n.parent != null; n = n.parent) {
            if (skipFirst) {
                skipFirst = false;
                continue;
            }
            log("Adding wire at " + getCoordText(n.wire.x, n.wire.y, n.wire.z));
            net.addWire(n.wire);
            if (buffer.getBlock(n.wire.x, n.wire.y-1, n.wire.z).block == Blocks.air) {
                buffer.setBlock(n.wire.x, n.wire.y-1, n.wire.z, Blocks.stone, 0);
            }
            if (n.wire.isRepeater) {
                int meta = -1;
                if (n.parent != null) {
                    if (n.wire.x > n.parent.wire.x) {
                        meta = 1;
                    } else if (n.wire.x < n.parent.wire.x) {
                        meta = 3;
                    } else if (n.wire.z < n.parent.wire.z) {
                        meta = 0;
                    } else if (n.wire.z > n.parent.wire.z) {
                        meta = 2;
                    }
                }
                if (meta == -1) {
                    log2("Warning: cannot determine proper direction from repeater");
                }
                buffer.setBlock(n.wire.x, n.wire.y, n.wire.z, Blocks.unpowered_repeater, meta);
            } else {
                buffer.setBlock(n.wire.x, n.wire.y, n.wire.z, Blocks.redstone_wire, 0);
            }
        }
    }

    private long getCoordinateHash(BlockBuffer buffer, int x, int y, int z) {
        long hash = x;
        hash *= buffer.getSizeY();
        hash += y;
        hash *= buffer.getSizeZ();
        hash += z;
        return hash;
    }

    private String getCoordText(int x, int y, int z) {
        return "[" + (x + debugMinX) + "," + (y + debugMinY) + "," + (z + debugMinZ) + "]";
    }

    private boolean route(BlockBuffer buffer, Net net, Net.Terminal source, Net.Terminal dest, boolean reverse) {
        if (source.x == dest.x && source.y == dest.y && source.z == dest.z) {
            // Nothing to do.
            return true;
        }

        HashMap<Long, Node> explored = new HashMap<Long, Node>();
        PriorityQueue<Node> queue = new PriorityQueue<Node>();
        queue.add(new Node(0, new Net.Wire(source.x, source.y, source.z, false, 0), null));
        int count = 0;
        while (!queue.isEmpty()) {
            Node node = queue.remove();
            if (isDest(node.wire.x, node.wire.y, node.wire.z, buffer, net, dest)) {
                commitRoute(buffer, net, node, true);
                return true;
            }

            boolean nextIsRepeater = node.lengthSinceLastRepeater > 10;

            // There are twelve possible spots to extend a wire: each NESW
            // direction at the same level, each NESW direction one level
            // higher, and each NESW direction one level lower.  However,
            // height changes are not allowed if we're placing a repeater.
            int min = 0;
            int max;
            if (count == 0 || nextIsRepeater) {
                max = 4;
            } else if (node.parent != null && node.wire.isRepeater) {
                if (node.parent.wire.x < node.wire.x) {
                    min = 0;
                } else if (node.parent.wire.x > node.wire.x) {
                    min = 1;
                } else if (node.parent.wire.z < node.wire.z) {
                    min = 2;
                } else if (node.parent.wire.z > node.wire.z) {
                    min = 3;
                }
                max = min + 1;
            } else {
                max = 12;
            }
            for (int i = min; i < max; i++) {
                int x = node.wire.x;
                int y = node.wire.y;
                int z = node.wire.z;
                switch (i) {
                case 0:
                    x++;
                    break;
                case 1:
                    x--;
                    break;
                case 2:
                    z++;
                    break;
                case 3:
                    z--;
                    break;
                case 4:
                    x++;
                    y++;
                    break;
                case 5:
                    x--;
                    y++;
                    break;
                case 6:
                    z++;
                    y++;
                    break;
                case 7:
                    z--;
                    y++;
                    break;
                case 8:
                    x++;
                    y--;
                    break;
                case 9:
                    x--;
                    y--;
                    break;
                case 10:
                    z++;
                    y--;
                    break;
                case 11:
                    z--;
                    y--;
                    break;
                }

                boolean good;
                if (isDest(x, y, z, buffer, net, dest)) {
                    if (y != node.wire.y) {
                        // Destination must be reached from equal height.
                        break;
                    } else {
                        good = true;
                    }
                } else {
                    good = canPlaceWire(buffer, net, node, dest, x, y, z);
                }

                if (good) {
                    double g;
                    if (y > node.wire.y) {
                        g = 2;
                    } else if (y < node.wire.y) {
                        g = 1.5;
                    } else {
                        g = 1;
                    }

                    //int h = Net.getDistance(x, y, z, dest.x, dest.y, dest.z);

                    long hash = getCoordinateHash(buffer, x, y, z);
                    Node child = explored.get(hash);

                    if (count == debugCutoff) {
                        if (child != null) {
                            buffer.setBlock(x, y, z, Blocks.dirt, 0);
                        } else {
                            buffer.setBlock(x, y, z, Blocks.cobblestone, 0);
                        }
                    }

                    if (child != null) {
                        if (child.totalCost > node.totalCost + g) {
                            queue.remove(child);
                            child.totalCost = node.totalCost + g;
                            queue.add(child);
                        }
                    } else {
                        child = new Node(node.totalCost + g, new Wire(x, y, z, nextIsRepeater, 0), node);
                        queue.add(child);
                        explored.put(hash, child);
                    }
                }
            }

            count++;
            if (count > debugCutoff) {
                log2("Gave up.. partial solution; ost " + node.totalCost);
                commitRoute(buffer, net, node, false);
                return true;
            }
            if (queue.size() > 2000000) {
                log2("Queue got too big. Aborting...");
                return false;
            }
        }
        log2("Failed after " + count + " iterations");
        return false;
    }
}
