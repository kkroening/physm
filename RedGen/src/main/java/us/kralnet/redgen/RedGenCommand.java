package us.kralnet.redgen;

import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.init.Blocks;
import net.minecraft.util.ChatComponentText;
import net.minecraft.world.World;

public class RedGenCommand extends CommandBase {
    @Override
    public String getCommandName() {
        return "redgen";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "foobar";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            //player.addChatMessage(new ChatComponentText("RedGen awwwyeaaah"));
            player.addChatMessage(new ChatComponentText(jacksontst.tst()));
            run(player, 0, 40, 0, 10, 80, 10);
        }
    }

    private void run(EntityPlayer player, int x1, int y1, int z1, int x2, int y2, int z2) {
        World world = player.getEntityWorld();
        int xmin = Math.min(x1, x2);
        int ymin = Math.min(y1, y2);
        int zmin = Math.min(z1, z2);
        int xmax = Math.max(x1, x2);
        int ymax = Math.max(y1, y2);
        int zmax = Math.max(z1, z2);
        //player.addChatMessage(new ChatComponentText("RedGen messing with coords " + xmin + ", " + ymin + ", " + zmin));
        for (int x = xmin; x < xmax; x++) {
            for (int y = ymin; y < ymax; y++) {
                for (int z = zmin; z < zmax; z++) {
                    if (y > 63) {
                        world.setBlockToAir(x, y, z);
                    } else {
                        world.setBlock(x, y, z, Blocks.stone, 0, 3);
                    }
                }
            }
        }
        world.setBlock(0, 64, 0, Blocks.stone, 0, 3);
        world.setBlock(0, 64, 1, Blocks.redstone_torch, 3, 3);
        world.setBlock(1, 64, 0, Blocks.redstone_torch, 1, 3);
    }
}
