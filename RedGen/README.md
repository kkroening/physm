Introduction
============

RedGen is a tool that automates the process of constructing redstone circuits in Minecraft.

Minecraft is a voxel-based video-game where players can collect blocks to be used in building structures, both decorative and functional, in a manner similar to that of playing with legos. One intriguing area of minecraft is Redstone logic, which enables players to create functional circuit-like structures that operate on the principles of digital logic. Redstone logic consists of torches and wires: a torch inverts the signal of its input and wires logically OR all of their inputs and distribute outputs to other torches and wires. These simple constructs, equivalent to OR and NOT gates, can be combined to produce any sort of digital logic, as NOR gates can be thought of as ``universal gates'' that can implement any other logical construct.

Despite the conceptual simplicity of redstone logic, elaborate redstone logic structures have been implemented in Minecraft that are similar to circuits found in real life, from set/reset latches to entire microprocessor designs. Given such a simple medium, the interest in redstone logic comes down to intelligently placing and connecting redstone components in a manner that produces a useful circuit. RedGen is here to assist!

Redstone Logic
==============

Similar to electronic design automation (EDA) for printed circuit boards, integrated circuits, and FPGAs, RedGen takes a high-level logic design such as that of a microprocessor and produces a corresponding functional implementation, allowing redstone logic designers to work on a high level rather than obsessing over the tedious and error-prone chore of intelligently placing individual blocks, just as software designers use compilers for a high-level language rather than writing assembly code.

Since the extensive work on electronic design automation focuses on solving an identical problem for real-world electronics, it would be wise to leverage this expertise. EDA tools used in FPGA development take high-level design code written in languages such as Verilog or VHDL and produce a cell configuration through several stages of compilation. The design is first translated into a set of gates (NAND, NOR, etc.), then a process known as ``Place and Route'' converts the gate list into an FPGA configuration. Similarly, for integrated circuit design automation, the Place and Route stage produces a physical circuit layout that satisfies the gate-level design specification. Redstone logic is not much different from either of these conceptually, rather that the logic is placed and routed on a different medium - redstone torches and wires versus FPGA cells or physical electronic gates.

RedGen is targetted specifically at the Place and Route stage of electronic design automation. The input is a list of gates and the output is a Minecraft block configuration that implements the gate-level design while satisfying any user-specified constraints. At its core Place and Route can be conceptually viewed as a search problem, where the state space is a set of block configurations and the goal state is a configuration that successfully implements the desired functionality. The higher level Translation stage in EDA, where a high-level Verilog/VHDL design is translated to a gate list, is outside of the initial goals of RedGen. Working with a pre-made gate list should prove sufficiently challenging for an initial project, and RedGen could later be expanded to include a Translation stage taking Verilog/VHDL as input.

While the problem is similar to that of real-world hardware design, there are a few notable domain-specific challenges that arise when dealing with Redstone - particularly with regard to timing and placement constraints.  A redstone wire has latency that is proportional to the length of the wire, much like how trace lengths in a circuit design affect latency. Wire latency requires special consideration, as introducing latency in inherently timing-sensitive circuits can cause things to go out of sync. Similarly, placement of redstone torches has implied restrictions, as Minecraft blocks are restricted to a three-dimensional grid, and care must be taken to not place wires such that unintended short-circuit connections are made.


Logic Synthesis in RedGen
=========================

Logic synthesis consists of taking a high-level circuit design and converting it into a lower-level medium. In the case of RedGen, the high-level input is a set of gates and nets (or wires) connecting the gates, and the low-level medium is redstone logic. This process happens in two major steps: placement and routing. These stages are interconnected in the sense that the placement stage must generate output that the routing stage is able to work with.

## Placement

The placement stage is responsible for figuring out where to place components, such as a NAND gate. The gates must be strategically placed so that it's possible for them to be wired up during the placement stage. Due to the restrictions on redstone wiring, such as adequate spacing between traces of redstone in order to prevent short circuits, improperly placing components will cause the routing stage to fail, as there are plenty of possible choices for placement that make routing impossible given the constraints. As such, an iterative process is required in order to try multiple placement configurations; in other words, it's not likely to happen on the first try.

This may seem to suggest the use of an algorithm such as simulated annealing, so that while routing may fail after the first several attempts of placement, eventually the solution will emerge. The idea is followed in the design of RedGen.

## Routing

The routing stage takes as input a set of nets containing one or more input terminals and one or more output terminals, along with the locations of these terminals as chosen by the placement stage. The routing algorithm must find paths for the wires between terminals by placing traces of redstone wire and redstone repeaters, while minimizing the total trace length to meet timing requirements. The basic strategy of the routing algorithm is as follows:

- Split nets into output multiplexing subnets and input multiplexing subnets, such that both subnets contain either one input and one or more outputs, or one output and one or more inputs. This is needed in order to prevent feedback loops in redstone circuits.
- For each destination, first route a single source connection by minimizing path length. Then repeat the process for each additional source connection, but allowing the path to meet either the destination or the intermediate path so as to share common traces.

Using RedGen
============

RedGen is not currently in an end-user distributable form as it's still pre-alpha; to build RedGen from source, install Minecraft Forge for Minecraft 1.7.2, and run the following:

```
    ./setupDecompWorkspace
    ./gradlew runclient
```

If all goes well, RedGen should appear in the mods list of an instance of Minecraft that is launched by the above commands.

Once loaded, a few commands can be used to test the routing algorithm by specifying two endpoints. The endpoints can be specified by standing at a source location and enter the ``/pos1'' command, then standing at a destination location and entering ``/pos2''. Once the coordinates are selected, a redstone trace can be routed using the ``/route'' command. If all goes well, redstone wire traces will be produced that find their way around any obstructions. The routing algorithm places blocks under redstone traces where needed, but never modifies any existing (non-air) blocks, allowing it to work in dynamic environments.

Future of RedGen
================

Eventually RedGen will be able to take a high-level gate list and produce a fully functional redstone implementation in Minecraft.

Once the routing subtleties are worked out and multi-source/multi-destination routing is supported, the interesting aspect of developing an effective placement algorithm begins. The long-term goal is to be able to specify a list of gates and generate large amounts of redstone logic in an automated fashion.
