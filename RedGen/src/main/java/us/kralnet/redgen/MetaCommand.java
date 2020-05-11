package us.kralnet.redgen;

import net.minecraft.block.Block;
import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.util.ChatComponentText;
import net.minecraft.world.World;

public class MetaCommand extends CommandBase {
    @Override
    public String getCommandName() {
        return "meta";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            int x;
            int y;
            int z;
            if (params.length == 0) {
                x = (int) Math.floor(player.posX);
                y = (int) Math.floor(player.posY);
                z = (int) Math.floor(player.posZ);
            } else if (params.length == 3) {
                x = Integer.parseInt(params[0]);
                y = Integer.parseInt(params[1]);
                z = Integer.parseInt(params[2]);
            } else {
                player.addChatMessage(new ChatComponentText("Usage: meta [<x> <y> <z>]"));
                return;
            }
            player.addChatMessage(new ChatComponentText("Block [" + x + "," + y + "," + z + "] " + Block.getIdFromBlock(player.getEntityWorld().getBlock(x, y, z)) + "/" + player.getEntityWorld().getBlockMetadata(x, y, z)));
        }
    }
}
