package us.kralnet.redgen;

import java.util.ArrayList;

import net.minecraft.block.Block;
import net.minecraft.init.Blocks;
import net.minecraft.world.World;

/** Basic implementation of BlockTransaction.
 */
class BasicBlockTransaction implements BlockTransaction {
    class Mod {
        int x;
        int y;
        int z;
        Block oldBlock;
        int oldMeta;
        Block newBlock;
        int newMeta;

        Mod(int x, int y, int z, Block newBlock, int newMeta) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.newBlock = newBlock;
            this.newMeta = newMeta;
        }
    }

    World world;
    ArrayList<Mod> mods = new ArrayList<Mod>();
    boolean done;

    BasicBlockTransaction(World world) {
        this.world = world;
    }

    void addMod(int x, int y, int z, Block newBlock, int newMeta) {
        mods.add(new Mod(x, y, z, newBlock, newMeta));
    }

    /** Undo a single transaction.
     *
     * Returns false if a transaction couldn't be undone or there are no
     * transactions left to undo.
     */
    @Override
    public boolean undo() {
        assert done;
        if (mods.isEmpty()) {
            return false;
        }
        for (int i = mods.size() - 1; i >= 0; i--) {
            Mod mod = mods.get(i);
            Block block = world.getBlock(mod.x, mod.y, mod.z);
            int meta = world.getBlockMetadata(mod.x, mod.y, mod.z);
            if (mod.newBlock == block && (mod.newMeta == meta || block == Blocks.redstone_wire)) {
                world.setBlock(mod.x, mod.y, mod.z, mod.oldBlock, mod.oldMeta, 3);
            }
        }
        done = false;
        return true;
    }

    @Override
    public boolean redo() {
        assert !done;
        for (Mod mod : mods) {
            mod.oldBlock = world.getBlock(mod.x, mod.y, mod.z);
            mod.oldMeta = world.getBlockMetadata(mod.x, mod.y, mod.z);
            if (mod.oldBlock != mod.newBlock || mod.oldMeta != mod.newMeta) {
                world.setBlock(mod.x, mod.y, mod.z, mod.newBlock, mod.newMeta, 3);
            }
        }
        done = true;
        return true;
    }
}
