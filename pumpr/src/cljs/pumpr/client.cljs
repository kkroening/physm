(ns pumpr.client
  (:require [pumpr.core :as p]
            [shoreleave.remotes.http-rpc :refer [remote-callback]])
  (:require-macros [shoreleave.remotes.macros :as shore-macros]))

(enable-console-print!)

(def sub
  (->>
    (p/sinput :in)
    (p/smap #(* % 2))
    (p/soutput :out)
    (p/scompile)))

(defn example [x y]
  (let [z (->> (p/smerge [x y])
               (p/smap +))]
    {:a (->> z
             (p/smap #(+ z 2)))
     :b (->> z
             (p/sreduce + 0))}))

(defn example2 [x y]
  (p/sgroup
   {:x x, :y y}
   (let [z (->> (p/smerge [x y])
                (p/smap +))]
     {:a (->> z
              (p/smap #(+ z 2)))
      :b (->> z
             (p/sreduce + 0))})))

(def example3
  (->>
    (p/smerge
     {:a (p/sinput :in1)
      :b (p/sinput :in2)})
    (p/sdebug "foo")
    (p/smap #(first (vals %)))
    (p/sdebug "foo2")
    ;(p/sload (p/scell :sub))
    ;(flatten :in :out)
    ;(switch {:in1 in1, :in2 in2} {:out1 out1, :out2 out2})
    (p/smap #(* % 2))
    (p/sreduce + 0)
    (p/soutput :out)))

(defn ^:export init []
  (let [out (p/run {:in1 3, :in2 4} example3)]
    (set! (. (.getElementById js/document "container") -innerHTML) (str out))))

