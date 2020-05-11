(ns pumpr.eval-executor-test
  (:require [pumpr.core :as p]
            [pumpr.graph-utils :as pgu]
            [pumpr.group :as pgrp]
            [pumpr.eval-executor :as pee]
            [clojure.set :refer [rename-keys]]
            [clojure.algo.generic.functor :refer [fmap]]
            #?(:clj [clojure.test :refer [deftest is testing]]
               :cljs [cljs.test :refer-macros [deftest is testing]])))


(deftest test-scell-store-update
  (let [c (p/scell :c)
        s (->> (p/sinput :in)
               (p/sstore c))]
    (is (= {:type :cell-store-update
            :cell (p/scell :c)
            :id :c
            :parents [s]}
           (#'pee/scell-store-update s)))))

; FIXME
;(deftest test-scell-group-update
;  (let [c (p/scell :c)
;        s (->> (p/sinput :in)
;               (p/sgroup-start c))]
;    (is (= {:type :cell-group-update
;            :cell (p/scell :c)
;            :id :c
;            :parents [s]}
;           (#'pee/scell-group-update s)))))

(defn label-node [label-map node]  ;; TODO: move to common test file
  (if (contains? label-map node)
    (get label-map node)
    (if (empty? (:parents node))
      node
      (update-in
       node
       [:parents]
       (partial map (partial label-node label-map))))))

(defn massage-topo-sort-output  ;; TODO: move to common test file
  "Map items in topo-sort output to use keywords so that the assertion output is readable when tests fail."
  [out label-map]
  (let [map-successors
        (fn [successors parent children]
          (let [mapped-parent   (label-node label-map parent)
                mapped-children (set (map (partial label-node label-map) children))]
            (assoc successors mapped-parent mapped-children)))]
    (-> out
        (update-in [:nodes] #(map label-map % %))
        (update-in [:successors] #(reduce-kv map-successors {} %)))))

(defn massage-add-parents-output  ;; TODO: move to common test file
  [out label-map]
  (->> (massage-topo-sort-output out label-map)
       (label-node label-map)))

(deftest test-add-parents
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        m  (p/smerge [in1 in2])
        sc {:nodes [in1 in2 m]
            :successors {:in1 #{m}, :in2 #{m}}
            :parents [m]}
        m2 (p/smap inc m)
        in3 (p/sinput :in3)
        label-map {in1 :in1, in2 :in2, m :m, m2 :m2, in3 :in3}]
    (is (= {:nodes [:in1 :in2 :m :in3 :m2]
            :successors {:in1 #{:m}, :in2 #{:m}, :m #{:m2}}
            :parents [:m :m2 :in3]}
           (-> (#'pee/add-parents sc [m2 in3])
               (massage-add-parents-output label-map))))))

(deftest test-get-cell-path
  (is (= [:x]
         (#'pee/get-cell-path (p/scell :x))))
  (is (= (list :x :y :z)
         (#'pee/get-cell-path (->> (p/scell :x 0) (p/scell :y 0) (p/scell :z 0))))))

(deftest test-build-cell-update-tree
  (is (= {} (#'pee/build-cell-update-tree [])))
  (let [z1 (->> (p/scell :x1 0)
                (p/scell :y1 0)
                (p/scell :z1 0)
                (#(p/sstore % (p/sinput :in))))
        z2 (->> (p/scell :x1 0)
                (p/scell :y1 0)
                (p/scell :z2 0)
                (#(p/sstore % (p/sinput :in))))
        z3 (->> (p/scell :x1 0)
                (p/scell :y2 0)
                (p/scell :z3 0)
                (#(p/sstore % (p/sinput :in))))
        y3 (->> (p/scell :x1 0)
                (p/scell :y3 0)
                (#(p/sstore % (p/sinput :in))))
        x2 (->> (p/scell :x2 0)
                (#(p/sstore % (p/sinput :in))))]
    (is (= {:x1 {:children {:y1 {:children {:z1 {:leaf z1}}}}}}
           (#'pee/build-cell-update-tree [z1])))
    (is (= {:x1 {:children {:y1 {:children {:z1 {:leaf z1}
                                             :z2 {:leaf z2}}}
                             :y2 {:children {:z3 {:leaf z3}}}
                             :y3 {:leaf y3}}}
             :x2 {:leaf x2}}
           (#'pee/build-cell-update-tree [z1 z2 z3 y3 x2])))))

(deftest test-compile-cell-updates
  (let [in        (p/sinput :in)
        c1        (p/scell :c1)
        c2        (p/scell :c2)
        l         (p/sload c1 in)
        m1        (p/smap inc l)
        s1        (p/sstore c1 m1)
        s2        (p/sstore c2 in)
        m2        (p/smap inc s1)
        out       (p/soutput :out m2)
        sc        (-> {:type :compile}
                      (p/extend-streams [s2 out])
                      (merge (#'pgu/topo-sort [s2 out])))
        u1        (#'pee/scell-store-update s1)
        u2        (#'pee/scell-store-update s2)
        label-map {in :in, c1 :c1, c2 :c2, l :l, m1 :m1, s1 :s1, s2 :s2, m2 :m2, out :out, u1 :u1, u2 :u2}]
    (is (= {:type :compile
            :nodes [:c1 :in :l :m1 :s1 :m2 :out :s2 :u2 :u1]
            :successors {:in #{:l :s2}, :c1 #{:l}, :l #{:m1}, :m1 #{:s1}, :s1 #{:m2 :u1}, :m2 #{:out}, :s2 #{:u2}}
            :parents [:s2 :out :u1 :u2]
            :cells #{c1 c2}}
           (-> (#'pee/compile-cell-updates sc)
               (massage-add-parents-output label-map)))))
  (let [c         (p/scell :c)
        in        (p/sinput :in)
        subgraph  {}  ;; dummy
        gs        (#'pgrp/group-start subgraph {:in in} {:out (p/smap inc in)} c)
        ge        (#'pgrp/group-end :out gs)
        out       (p/soutput :out ge)
        cge       (#'pgrp/group-end :c gs)
        sc        (-> {:type :compile}
                      (p/extend-streams [out])
                      (merge (#'pgu/topo-sort [out])))
        u         (#'pee/scell-group-update gs)
        label-map {c :c, in :in, gs :gs, ge :ge, out :out, cge :cge, u :u}]
    (is (= {:type :compile
            :nodes [:c :in :gs :ge :out :cge :u]
            :successors {:in #{:gs}, :c #{:gs}, :gs #{:ge :cge}, :ge #{:out}, :cge #{:u}}
            :parents [:out :u]
            :cells #{c}}
           (-> (#'pee/compile-cell-updates sc)
               (massage-add-parents-output label-map))))))

(deftest test-get-node-priority-map
  (is (= {:a 0, :b 1, :c 2, :d 3, :e 4}
         (#'pee/get-node-priority-map {:nodes [:a :b :c :d :e]}))))

(deftest test-compile-node-priority-map
  (is (= {:nodes [:a :b :c]
          :node-priority-map {:a 0, :b 1, :c 2}}
         (#'pee/compile-node-priority-map {:nodes [:a :b :c]}))))

(deftest test-get-input-map
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        c  (p/scell :c)
        l  (p/sload c in1)
        m  (p/smerge [l in2])
        sc {:type :compile, :nodes [in1 in2 c l m]}]
    (is (= {:in1 in1, :in2 in2, :c c}
           (#'pee/get-input-map sc)))))

(deftest test-compile-input-map
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        m  (p/smerge [in1 in2])
        sc {:type :compile, :nodes [in1 in2 m]}]
    (is (= {:type :compile
            :nodes [in1 in2 m]
            :input-map {:in1 in1, :in2 in2}}
           (#'pee/compile-input-map sc)))))

(deftest test-check-can-compile-streams
  (let [in  (p/sinput :in)
        out (p/soutput :out in)
        s   (p/sstore (p/scell :c) in)
        a   (pgu/analyze out s)]
    (is (= nil (#'pee/check-can-compile-streams [out s])))
    (is (= nil (#'pee/check-can-compile-streams [a])))))

(defn massage-scompile-output
  [out label-map]
  (-> out
      (massage-add-parents-output label-map)
      (update-in [:cells] #(fmap (partial label-node label-map) %))
      (update-in [:node-priority-map] #(rename-keys % label-map))))  ;; FIXME: use label-node on keys.

(deftest test-scompile
  (let [in        (p/sinput :in)
        out       (p/soutput :out in)
        c         (p/scell :c)
        s         (p/sstore c in)
        u         (#'pee/scell-store-update s)
        label-map {in :in, out :out, c :c, s :s, u :u}]
    (is (= {:type :compile
            :parents [:out :s :u]
            :nodes [:in :s :out :u]
            :successors {:in #{:s :out}, :s #{:u}}
            :cells #{:c}
            :node-priority-map {:s 1, :out 2, :in 0, :u 3}
            :input-map {:in {:type :input, :id :in}}}
           (-> (#'pee/scompile out s)
               (massage-scompile-output label-map))))))

(deftest test-select-exec-node
  (let [in  (p/sinput :in)
        m   (p/smap inc in)
        out (p/soutput :out m)
        sc  (pee/scompile out)]
    (is (= m
           (#'pee/select-exec-node sc [m])))
    (is (= nil
           (#'pee/select-exec-node sc [out]))))
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        m   (p/smerge [in1 in2])
        m2  (p/smap inc in2)
        m3  (p/smerge [m m2])
        out (p/soutput :out m3)
        sc  (pee/scompile out)]
    (is (= in2
           (#'pee/select-exec-node sc [in1 in2])))
    (is (= m2
           (#'pee/select-exec-node sc [in1 m m2])))
    (is (= in1
           (#'pee/select-exec-node sc [in1 m m3])))
    (is (= m
           (#'pee/select-exec-node sc [m m3])))
    (is (= m2
           (#'pee/select-exec-node sc [m2 m3])))
    (is (= m3
           (#'pee/select-exec-node sc [m3])))
    (is (= nil
           (#'pee/select-exec-node sc [out]))))
  (let [in  (p/sinput :in)
        c1  (p/scell :c1 nil)
        c2  (p/scell :c2 nil c1)
        l   (p/sload c2 in)
        m   (p/smap inc l)
        s   (p/sstore c2 m)
        out (p/soutput :out s)
        sc  (pee/scompile out)
        u1  (#'pee/scell-store-update s)
        u2  (#'pee/scell-merge-update {:c2 u1})]
    (is (= c1
           (#'pee/select-exec-node sc [in c1])))
    (is (= c2
           (#'pee/select-exec-node sc [in c2])))
    (is (= in
           (#'pee/select-exec-node sc [in l])))
    (is (= l
           (#'pee/select-exec-node sc [l])))
    (is (= m
           (#'pee/select-exec-node sc [m])))
    (is (= s
           (#'pee/select-exec-node sc [s])))
    (is (= u1
           (#'pee/select-exec-node sc [out u1])))
    (is (= nil
           (#'pee/select-exec-node sc [out u2])))))

(deftest test-get-output-streams
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        m   (p/smerge [in1 in2])
        m2  (p/smap inc in2)
        m3  (p/smerge [m m2])
        out (p/soutput :out m3)
        sc  (pee/scompile out)]
    (is (= #{m} (#'pee/get-output-streams sc in1)))
    (is (= #{m m2} (#'pee/get-output-streams sc in2)))))

(deftest test-add-output
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        m   (p/smerge [in1 in2])
        out (p/soutput :out m)
        sc  (pee/scompile out)]
    (is (= {in1 {nil 5}
            m   {in1 5}}
           (#'pee/add-output in1 5 {in1 {nil 5}} m)))
    (is (= {m   {in1 5}
            out {m [5 nil]}}
           (#'pee/add-output m [5 nil] {m {in1 5}} out)))))

(deftest test-add-outputs
  (let [in  (p/sinput :in)
        m1  (p/smap inc in)
        m2  (p/smap dec in)
        m3  (p/smerge [m1 m2])
        out (p/soutput :out m3)
        sc  (pee/scompile out)]
    (is (= {in {nil 5}
            m1 {in 5}
            m2 {in 5}}
           (#'pee/add-outputs {in {nil 5}} in #{m1 m2} 5)))))

(defn massage-event-map [event-map label-map]
  (->> (rename-keys event-map label-map)  ;; FIXME: use label-node
       (reduce-kv #(assoc %1 %2 (rename-keys %3 label-map)) {})))  ;; FIXME: use label-node

(deftest test-tick-compiled
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        m   (p/smerge [in1 in2])
        m2  (p/smap inc in2)
        m3  (p/smerge [m m2])
        out (p/soutput :out m3)
        sc  (pee/scompile out)
        label-map {in1 :in2, in2 :in2, m :m, m2 :m2, m3 :m3, out :out}
        event-maps
            [{in1 {nil 5}
              in2 {nil 5}}
             {in1 {nil 5}
              m   {in2 5}
              m2  {in2 5}}
             {in1 {nil 5}
              m   {in2 5}
              m3  {m2 6}}
             {m   {in1 5
                   in2 5}
              m3  {m2 6}}
             {m3  {m [5 5]
                   m2 6}}
             {out {m3 [[5 5] 6]}}
             {out {m3 [[5 5] 6]}}]]
    (reduce
     (fn [event-map next-event-map]
       (let [next-exec-node (#'pee/select-exec-node sc (keys event-map))]
         (is (= next-event-map
                (#'pee/tick-compiled pee/exec-node event-map sc)))
         (is (= next-event-map
                (#'pee/tick-compiled pee/exec-node event-map sc next-exec-node)))
         next-event-map))
     (first event-maps)
     (drop 1 event-maps))))

(deftest test-map-inputs
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        c   (p/scell :c)
        l   (p/sload c in1)
        m   (p/smerge [l in2])
        out (p/soutput :out m)
        sc  (pee/scompile out)]
    (is (= {in1 {nil 5}
            c   {nil 3}}
           (#'pee/map-input sc {in1 {nil 5}} :c 3)))))

(deftest test-map-outputs
  (let [in        (p/sinput :in)
        c         (p/scell :c)
        l         (p/sload c in)
        m1        (p/smap inc l)
        m2        (p/smap dec l)
        s         (p/sstore c m1)
        su        (#'pee/scell-store-update s)
        out1      (p/soutput :out1 s)
        out2      (p/soutput :out2 m2)
        m         (p/smerge [l in])
        out       (p/soutput :out m)
        sc        (pee/scompile out)
        event-map {out1 {s 5}
                   out2 {m2 3}
                   su   {s 5}}]
    (is (= {:out1 5
            :out2 3
            :c 5}
           (#'pee/map-outputs sc event-map)))))

(deftest test-run
  (let [c          (p/scell :c 100)
        trigger    (p/sinput :trigger)
        multiplier (p/sinput :multiplier)
        counter    (->> trigger
                        (p/sload c)
                        (p/smap inc)
                        (p/sstore c))
        out1       (->> (p/smerge [counter multiplier])
                        (p/sfilter (partial not-any? nil?))
                        (p/smap (partial apply *))
                        (p/soutput :out1))
        out2       (->> counter
                        (p/smap inc)
                        (p/soutput :out2))
        sc         (pee/scompile out1 out2)]
    (let [input-map       {:trigger nil, :multiplier 3, :c 5}
          event-map       (#'pee/map-inputs input-map sc)
          final-event-map {:out1 18, :out2 7, :c 6}]
      (is (= final-event-map (pee/run input-map out1 out2)))
      (is (= final-event-map (pee/run input-map sc)))
      (is (= final-event-map (pee/do-run pee/exec-node event-map sc))))
    (is (= {:out2 7, :c 6}
           (pee/run {:trigger nil, :c 5} sc)))
    (is (= {:out2 102, :c 101}
           (pee/run {:trigger nil} sc)))
    (is (= {}  ;; TODO: consider having this output unchanged cells
           (pee/run {} sc)))))

