package us.kralnet.redgen;

import java.util.LinkedList;
import java.util.List;
import java.util.Stack;

import cpw.mods.fml.relauncher.FMLRelaunchLog;

import net.minecraft.block.Block;
import net.minecraft.init.Blocks;
import net.minecraft.world.World;

/** Temporary storage for block data.
 */
class BlockBuffer {
    class BlockData {
        Block block;
        int meta;
        boolean modified;

        BlockData(BlockData other) {
            block = other.block;
            meta = other.meta;
            modified = other.modified;
        }

        BlockData(Block block, int meta) {
            this.block = block;
            this.meta = meta;
        }

        @Override
        public BlockData clone() {
            return new BlockData(this);
        }
    }

    private BlockData[][][] blocks;

    /** Construct an initially empty BlockBuffer.
     */
    public BlockBuffer(int xs, int ys, int zs) {
        blocks = new BlockData[xs][ys][zs];
        for (int x = 0; x < xs; x++) {
            for (int y = 0; y < ys; y++) {
                for (int z = 0; z < zs; z++) {
                    blocks[x][y][z] = new BlockData(Blocks.air, 0);
                }
            }
        }
    }

    public BlockBuffer(BlockBuffer other) {
        blocks = other.blocks.clone();
        for (int x = 0; x < blocks.length; x++) {
            for (int y = 0; y < blocks[x].length; y++) {
                for (int z = 0; z < blocks[x][y].length; z++) {
                    blocks[x][y][z] = blocks[x][y][z].clone();
                }
            }
        }
    }

    /** Construct a BlockBuffer from a world region.
     */
    public BlockBuffer(World world, int x1, int y1, int z1, int x2, int y2, int z2) {
        int xmin = Math.min(x1, x2);
        int ymin = Math.min(y1, y2);
        int zmin = Math.min(z1, z2);
        int xmax = Math.max(x1, x2);
        int ymax = Math.max(y1, y2);
        int zmax = Math.max(z1, z2);
        blocks = new BlockData[xmax-xmin][ymax-ymin][zmax-zmin];
        for (int x = 0; x < xmax - xmin; x++) {
            for (int y = 0; y < ymax - ymin; y++) {
                for (int z = 0; z < zmax - zmin; z++) {
                    blocks[x][y][z] = new BlockData(world.getBlock(x + xmin, y + ymin, z + zmin), world.getBlockMetadata(x + xmin, y + ymin, z + zmin));
                }
            }
        }
    }

    public boolean isInRange(int x, int y, int z) {
        if (x < 0 || y < 0 || z < 0 || x >= blocks.length || y >= blocks[0].length || z >= blocks[0][0].length) {
            return false;
        } else {
            return true;
        }
    }

    public int getSizeX() {
        return blocks.length;
    }

    public int getSizeY() {
        if (blocks.length == 0) {
            return 0;
        } else {
            return blocks[0].length;
        }
    }

    public int getSizeZ() {
        if (blocks.length == 0 || blocks[0].length == 0) {
            return 0;
        } else {
            return blocks[0][0].length;
        }
    }

    public BlockData getBlock(int x, int y, int z) {
        if (!isInRange(x, y, z)) {
            return new BlockData(Blocks.air, 0);
        }
        return blocks[x][y][z];
    }

    public int getBlockCount() {
        if (blocks.length == 0 || blocks[0].length == 0 || blocks[0][0].length == 0) {
            return 0;
        } else {
            return blocks.length * blocks[0].length * blocks[0][0].length;
        }
    }

    public int getModifiedCount() {
        int count = 0;
        for (int x = 0; x < blocks.length; x++) {
            for (int y = 0; y < blocks[x].length; y++) {
                for (int z = 0; z < blocks[x][y].length; z++) {
                    if (blocks[x][y][z].modified) {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    public int getNonAirCount() {
        int count = 0;
        for (int x = 0; x < blocks.length; x++) {
            for (int y = 0; y < blocks[x].length; y++) {
                for (int z = 0; z < blocks[x][y].length; z++) {
                    if (blocks[x][y][z].block != Blocks.air) {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    public boolean setBlock(int x, int y, int z, Block block, int meta) {
        if (isInRange(x, y, z)) {
            BlockData blockData = blocks[x][y][z];
            blockData.block = block;
            blockData.meta = meta;
            blockData.modified = true;
            return true;
        } else {
            return false;
        }
    }

    public void fill(int x1, int y1, int z1, int x2, int y2, int z2, Block block, int meta) {
        int xmin = Math.min(x1, x2);
        int ymin = Math.min(y1, y2);
        int zmin = Math.min(z1, z2);
        int xmax = Math.max(x1, x2);
        int ymax = Math.max(y1, y2);
        int zmax = Math.max(z1, z2);
        for (int x = xmin; x <= xmax; x++) {
            for (int y = ymin; y<= ymax; y++) {
                for (int z = zmin; z <= zmax; z++) {
                    setBlock(x, y, z, block, meta);
                }
            }
        }
    }

    public void setModified() {
        for (int x = 0; x < blocks.length; x++) {
            for (int y = 0; y < blocks[x].length; y++) {
                for (int z = 0; z < blocks[x][y].length; z++) {
                    blocks[x][y][z].modified = true;
                }
            }
        }
    }

    /** Determine ordering of blocks for buffer transfer.
     *
     * This is an incomplete list; if you want something more general purpose
     * use WorldEdit instead of this.
     */
    public static int getBlockPrecedence(Block block) {
        if (       block == Blocks.torch
                || block == Blocks.redstone_torch
                || block == Blocks.unlit_redstone_torch
                || block == Blocks.redstone_torch
                || block == Blocks.redstone_wire)
        {
            return 1;
        } else {
            return 0;
        }
    }

    /** Transfer modified blocks into a world region.
     *
     * This needs to be done in multiple passes so that things like torches get
     * placed after normal blocks are placed.
     */
    public void transfer(World world, int tx, int ty, int tz, BlockTransactionManager tm) {
        BasicBlockTransaction trans = new BasicBlockTransaction(world);
        for (int pass = 0; pass < 2; pass++) {
            for (int x = 0; x < blocks.length; x++) {
                for (int y = 0; y < blocks[x].length; y++) {
                    for (int z = 0; z < blocks[x][y].length; z++) {
                        BlockData blockData = blocks[x][y][z];
                        if (blockData.modified && getBlockPrecedence(blockData.block) == pass) {
                            int wx = x + tx;
                            int wy = y + ty;
                            int wz = z + tz;
                            trans.addMod(wx, wy, wz, blockData.block, blockData.meta);
                        }
                    }
                }
            }
        }
        if (tm != null) {
            trans.redo();
            tm.addTransaction(trans);
        }
    }

    public BlockBuffer clone() {
        return new BlockBuffer(this);
    }
}
