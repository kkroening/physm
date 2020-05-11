# llvm-example

An example of using LLVM to do JIT compilation at the REPL.

See my [Clojure.mn presentation](https://docs.google.com/presentation/d/1nGUM3z8icynYQ_fj02Y_AefXwHaIuCsvubwKtpKPdxI/edit?usp=sharing) for more information about using LLVM with Clojure.

## LLVM setup

```
git clone http://llvm.org/git/llvm.git || exit 1
mkdir build
cd build
cmake -G "Unix Makefiles" -DLLVM_BUILD_LLVM_DYLIB=1 ../llvm || exit 1
make -j 3 || exit 1
```

## REPL commands

Set up `LD_LIBRARY_PATH` / `DYLD_LIBRARY_PATH`:
```
export DYLD_LIBRARY_PATH=$PATH_TO_LLVM_BUILD/lib
```

Start REPL with `lein repl` and run the following:
```
(use 'llvm-example.core)

(def llvm-mod (LLVMModuleCreateWithName "example"))
(println (LLVMPrintModuleToString llvm-mod))

(def args (into-array [(LLVMDoubleType) (LLVMDoubleType)]))
(def fn-type (LLVMFunctionType (LLVMDoubleType) args (count args) 0))
(def llvm-fn (LLVMAddFunction llvm-mod "average" fn-type))

(def arg1 (LLVMGetParam llvm-fn 0))
(def arg2 (LLVMGetParam llvm-fn 1))
(def entry (LLVMAppendBasicBlock llvm-fn "entry"))
(def builder (LLVMCreateBuilder))
(LLVMPositionBuilderAtEnd builder entry)
(def adder-result (LLVMBuildFAdd builder arg1 arg2 ""))
(def const2 (LLVMConstReal (LLVMDoubleType) (double 2.0)))
(def divider-result (LLVMBuildFDiv builder adder-result const2 ""))
(LLVMBuildRet builder divider-result)
(LLVMDisposeBuilder builder)
(println (LLVMPrintModuleToString llvm-mod))

(def engine (create-execution-engine llvm-mod))
(def fn-ptr (LLVMGetGlobalValueAddress engine "average"))
(def jna-fn (com.sun.jna.Function/getFunction fn-ptr))
(println (.invoke jna-fn Double (into-array [3.0 8.0])))
```

The following output should appear:
```
; ModuleID = 'example'

; ModuleID = 'example'

define double @derp(double, double) {
entry:
  %2 = fadd double %0, %1
  %3 = fdiv double %2, 2.000000e+00
  ret double %3
}

5.5
nil
```

## License

Copyright © 2015 FIXME

Distributed under the Eclipse Public License either version 1.0 or (at
your option) any later version.
