package us.kralnet.redgen;

import cpw.mods.fml.relauncher.FMLRelaunchLog;
import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.init.Blocks;
import net.minecraft.util.ChatComponentText;
import net.minecraft.util.ChunkCoordinates;
import net.minecraft.world.World;

public class Pos2Command extends CommandBase {
    @Override
    public String getCommandName() {
        return "pos2";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "[<x> <y> <z>]";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            PlayerInfo info = RedGen.getInstance().getPlayerInfo(player);
            double x;
            double y;
            double z;
            if (params.length == 0) {
                x = player.posX;
                y = player.posY;
                z = player.posZ;
            } else if (params.length == 3) {
                x = Double.parseDouble(params[0]);
                y = Double.parseDouble(params[1]);
                z = Double.parseDouble(params[2]);
            } else {
                player.addChatMessage(new ChatComponentText("Usage: pos2 "));
                return;
            }
            int ix = (int) Math.floor(x);
            int iy = (int) Math.floor(y);
            int iz = (int) Math.floor(z);
            player.addChatMessage(new ChatComponentText("Position 2 set to [" + ix + "," + iy + "," + iz + "]"));
            info.setPos(2, x, y, z);
        }
    }
}
