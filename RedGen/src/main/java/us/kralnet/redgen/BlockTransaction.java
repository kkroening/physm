package us.kralnet.redgen;

/** A set of block modifications that can be undone/redone.
 */
public interface BlockTransaction {
    public boolean undo();
    public boolean redo();
}
