package us.kralnet.redgen;

import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.init.Blocks;
import net.minecraft.util.ChatComponentText;
import net.minecraft.world.World;

public class PasteCommand extends CommandBase {
    @Override
    public String getCommandName() {
        return "paste";
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
            PlayerInfo.Position pos = info.getPosFloor(1);
            if (pos == null) {
                player.addChatMessage(new ChatComponentText("Please specify position with /pos1."));
            } else if (info.getBuffer() == null) {
                player.addChatMessage(new ChatComponentText("Please copy a region with /copy first."));
            } else {
                info.getBuffer().transfer(player.getEntityWorld(), (int) pos.x, (int) pos.y, (int) pos.z, RedGen.getInstance().getTransactionManager());
                player.addChatMessage(new ChatComponentText("Pasted " + info.getBuffer().getBlockCount() + " blocks (" + info.getBuffer().getNonAirCount() + " non-air blocks"));
            }
        }
    }
}
