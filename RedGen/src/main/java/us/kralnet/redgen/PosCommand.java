package us.kralnet.redgen;

import cpw.mods.fml.relauncher.FMLRelaunchLog;
import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.init.Blocks;
import net.minecraft.util.ChatComponentText;
import net.minecraft.util.ChunkCoordinates;
import net.minecraft.world.World;

public class PosCommand extends CommandBase {
    @Override
    public String getCommandName() {
        return "pos";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "<number> [clear] | [<x> <y> <z>]";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            PlayerInfo info = RedGen.getInstance().getPlayerInfo(player);
            int id;
            double x;
            double y;
            double z;
            if (params.length == 0) {
                // FIXME: print positions.
                player.addChatMessage(new ChatComponentText("Usage: pos " + getCommandUsage(sender)));
                return;
            }
            id = Integer.parseInt(params[0]);
            if (params.length == 1) {
                x = player.posX;
                y = player.posY;
                z = player.posZ;
            } else if (params.length == 2) {
                if (params[1] == "clear") {
                    info.clearPos(id);
                }
                player.addChatMessage(new ChatComponentText("Position " + id + " cleared."));
                return;
            } else if (params.length == 4) {
                x = Double.parseDouble(params[1]);
                y = Double.parseDouble(params[2]);
                z = Double.parseDouble(params[3]);
            } else {
                player.addChatMessage(new ChatComponentText("Usage: pos " + getCommandUsage(sender)));
                return;
            }
            player.addChatMessage(new ChatComponentText("Position " + id + " set to [" + (int) x + "," + (int) y + "," + (int) z + "]"));
            info.setPos(id, x, y, z);
        }
    }
}
