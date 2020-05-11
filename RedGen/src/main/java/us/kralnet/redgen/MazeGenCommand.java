package us.kralnet.redgen;

import java.util.Random;
import java.util.Stack;

import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.init.Blocks;
import net.minecraft.util.ChatComponentText;
import net.minecraft.world.World;

public class MazeGenCommand extends CommandBase {
    private static class MazeNode {
        enum Direction {
            UP,
            DOWN,
            LEFT,
            RIGHT
        }

        private int nodex;
        private int nodey;
        private int neighborMask;
        private boolean visited;

        MazeNode(int nodex, int nodey) {
            this.nodex = nodex;
            this.nodey = nodey;
        }

        int getNodeX() {
            return nodex;
        }

        int getNodeY() {
            return nodey;
        }

        boolean hasWall(Direction dir) {
            return (neighborMask & (1 << dir.ordinal())) == 0;
        }

        void removeWall(Direction dir) {
            neighborMask |= (1 << dir.ordinal());
        }

        boolean visit() {
            if (visited) {
                return false;
            } else {
                visited = true;
                return true;
            }
        }

        boolean isVisited() {
            return visited;
        }

        static Direction getOtherDirection(Direction dir) {
            switch (dir) {
            case UP:
                return Direction.DOWN;
            case DOWN:
                return Direction.UP;
            case LEFT:
                return Direction.RIGHT;
            case RIGHT:
            default:
                return Direction.LEFT;
            }
        }
    }

    private static class Maze {
        int width;
        int height;
        MazeNode[][] nodes;

        Maze(int width, int height, long seed) {
            this.width = width;
            this.height = height;
            nodes = new MazeNode[width][height];
            for (int i = 0; i < width; i++) {
                for (int j = 0; j < height; j++) {
                    nodes[i][j] = new MazeNode(i, j);
                }
            }
            generate(seed);
        }

        private void generate(long seed) {
            Random r = new Random(seed);
            Stack<MazeNode> stack = new Stack<MazeNode>();
            nodes[0][0].removeWall(MazeNode.Direction.LEFT);
            nodes[width-1][height-1].removeWall(MazeNode.Direction.RIGHT);
            stack.push(nodes[0][0]);
            while (!stack.isEmpty()) {
                MazeNode node = stack.peek();
                node.visit();
                int nodex = node.getNodeX();
                int nodey = node.getNodeY();

                // Find number of unvisited neighbors.
                int count = 0;
                if (nodey != 0 && !nodes[nodex][nodey-1].isVisited()) {
                    count++;
                }
                if (nodey != height-1 && !nodes[nodex][nodey+1].isVisited()) {
                    count++;
                }
                if (nodex != 0 && !nodes[nodex-1][nodey].isVisited()) {
                    count++;
                }
                if (nodex != width-1 && !nodes[nodex+1][nodey].isVisited()) {
                    count++;
                }
                if (count == 0) {
                    // No unvisited neighbors.
                    stack.pop();
                    continue;
                }

                // Select random neighbor.
                int index = r.nextInt(count);
                if (nodey != 0 && !nodes[nodex][nodey-1].isVisited()) {
                    if (index == 0) {
                        node.removeWall(MazeNode.Direction.UP);
                        nodes[nodex][nodey-1].removeWall(MazeNode.Direction.DOWN);
                        stack.push(nodes[nodex][nodey-1]);
                        continue;
                    } else {
                        index--;
                    }
                }
                if (nodey != height-1 && !nodes[nodex][nodey+1].isVisited()) {
                    if (index == 0) {
                        node.removeWall(MazeNode.Direction.DOWN);
                        nodes[nodex][nodey+1].removeWall(MazeNode.Direction.UP);
                        stack.push(nodes[nodex][nodey+1]);
                        continue;
                    } else {
                        index--;
                    }
                }
                if (nodex != 0 && !nodes[nodex-1][nodey].isVisited()) {
                    if (index == 0) {
                        node.removeWall(MazeNode.Direction.LEFT);
                        nodes[nodex-1][nodey].removeWall(MazeNode.Direction.RIGHT);
                        stack.push(nodes[nodex-1][nodey]);
                        continue;
                    } else {
                        index--;
                    }
                }
                if (nodex != width-1 && !nodes[nodex+1][nodey].isVisited()) {
                    if (index == 0) {
                        node.removeWall(MazeNode.Direction.RIGHT);
                        nodes[nodex+1][nodey].removeWall(MazeNode.Direction.LEFT);
                        stack.push(nodes[nodex+1][nodey]);
                        continue;
                    }
                }
                // Should never get here.
                assert false;
            }
        }

        BlockBuffer toBlockBuffer() {
            BlockBuffer buffer = new BlockBuffer(width*4+1, 4, height*4+1);
            buffer.fill(0, 3, 0, width*4, 3, height*4, Blocks.glass, 0);
            for (int nodex = 0; nodex < width; nodex++) {
                for (int nodey = 0; nodey < height; nodey++) {
                    MazeNode node = nodes[nodex][nodey];
                    if (nodex == 0 && node.hasWall(MazeNode.Direction.LEFT)) {
                        buffer.fill(0, 0, nodey*4, 0, 3, nodey*4+4, Blocks.stone, 0);
                    }
                    if (nodey == 0 && node.hasWall(MazeNode.Direction.UP)) {
                        buffer.fill(nodex*4, 0, 0, nodex*4+4, 3, 0, Blocks.stone, 0);
                    }
                    if (node.hasWall(MazeNode.Direction.RIGHT)) {
                        buffer.fill(nodex*4+4, 0, nodey*4, nodex*4+4, 3, nodey*4+4, Blocks.stone, 0);
                    }
                    if (node.hasWall(MazeNode.Direction.DOWN)) {
                        buffer.fill(nodex*4, 0, nodey*4+4, nodex*4+4, 3, nodey*4+4, Blocks.stone, 0);
                    }
                }
            }
            return buffer;
        }
    }

    @Override
    public String getCommandName() {
        return "mazegen";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "mazegen <width> <height>";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            PlayerInfo info = RedGen.getInstance().getPlayerInfo(player);

            PlayerInfo.Position pos = info.getPosFloor(1);
            if (pos == null) {
                player.addChatMessage(new ChatComponentText("Please specify position with /pos1."));
            } else if (params.length != 2) {
                player.addChatMessage(new ChatComponentText("Usage: " + getCommandUsage(sender)));
            } else {
                int width = Integer.parseInt(params[0]);
                int height = Integer.parseInt(params[1]);
                Maze maze = new Maze(width, height, 0);
                BlockBuffer buffer = maze.toBlockBuffer();
                buffer.transfer(player.getEntityWorld(), (int) pos.x, (int) pos.y, (int) pos.z, RedGen.getInstance().getTransactionManager());
                player.addChatMessage(new ChatComponentText("Generated " + width + "x" + height + " maze"));
            }
        }
    }
}
