package us.kralnet.redgen;

import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.init.Blocks;
import net.minecraft.util.ChatComponentText;
import net.minecraft.world.World;

public class CopyCommand extends CommandBase {
    @Override
    public String getCommandName() {
        return "copy";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            PlayerInfo info = RedGen.getInstance().getPlayerInfo(player);
            PlayerInfo.Position pos1 = info.getPosFloor(1);
            PlayerInfo.Position pos2 = info.getPosFloor(2);
            if (pos1 == null || pos2 == null) {
                player.addChatMessage(new ChatComponentText("Please specify positions with /pos1 and /pos2."));
            } else {
                int miny = (int) Math.min(pos1.y, pos2.y);
                //int maxy = Math.max(info.getPos1yFloor(), info.getPos2yFloor());
                BlockBuffer buffer = new BlockBuffer(player.getEntityWorld(), (int) pos1.x, miny, (int) pos1.z, (int) pos2.x, 150, (int) pos2.z);
                buffer.setModified();
                info.setBuffer(buffer);
                player.addChatMessage(new ChatComponentText("Copied " + buffer.getBlockCount() + " blocks (" + buffer.getNonAirCount() + " non-air blocks)"));
            }
        }
    }
}
