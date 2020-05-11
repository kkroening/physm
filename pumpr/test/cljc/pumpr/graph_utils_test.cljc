(ns pumpr.graph-utils-test
  (:require [pumpr.core :as p]
            [pumpr.graph-utils :as pgu]
            #?(:clj [clojure.test :refer [deftest is testing]]
               :cljs [cljs.test :refer-macros [deftest is testing]])))

(defn label-node [label-map node]  ;; TODO: move to separate test file
  (if (contains? label-map node)
    (get label-map node)
    (if (empty? (:parents node))
      node
      (update-in
       node
       [:parents]
       (partial map (partial label-node label-map))))))

(defn massage-topo-sort-output  ;; TODO: move to separate test file
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

(defn massage-node-map  ;; TODO: move to separate test file
  [node-map label-map]
  (reduce-kv
   (fn [acc old-node new-node]
     (assoc
      acc
      (label-node label-map old-node)
      (label-node label-map new-node)))
   {}
   node-map))

(deftest test-topo-sort
  (let [in1 (p/sinput :in1)
        in2 (p/sinput :in2)
        m  (p/smerge [in1 in2])
        m2 (p/smap inc in1)
        m3 (p/smap dec in1)
        m4 (p/smerge [m2 m3])
        m5 (p/smerge [m4 in2])
        label-map {in1 :in1, in2 :in2, m :m, m2 :m2, m3 :m3, m4 :m4, m5 :m5}]
    (is (= {:nodes [:in1]
            :successors {}}
           (-> (#'pgu/topo-sort [in1])
               (massage-topo-sort-output label-map))))
    (is (= {:nodes [:in2 :in1]
            :successors {}}
           (-> (#'pgu/topo-sort [in1 in2])
               (massage-topo-sort-output label-map))))
    (is (= {:nodes [:in2 :in1 :m]
            :successors {:in1 #{:m}, :in2 #{:m}}}
           (-> (#'pgu/topo-sort [m])
               (massage-topo-sort-output label-map))))
    (is (= {:nodes [:in1 :m3 :m2 :m4]
            :successors {:in1 #{:m2 :m3}
                         :m2 #{:m4}
                         :m3 #{:m4}}}
           (-> (#'pgu/topo-sort [m4])
               (massage-topo-sort-output label-map))))
    (is (= {:nodes [:in2 :in1 :m3 :m2 :m4 :m5]
            :successors {:in1 #{:m2 :m3}
                         :in2 #{:m5}
                         :m2 #{:m4}
                         :m3 #{:m4}
                         :m4 #{:m5}}}
           (-> (#'pgu/topo-sort [m5])
               (massage-topo-sort-output label-map))))
    (is (= {:nodes [:in2 :m4 :m5]
            :successors {:in2 #{:m5}
                         :m2 #{:m4}
                         :m3 #{:m4}
                         :m4 #{:m5}}}
           (-> (#'pgu/topo-sort [m5] #{m2 m3})
               (massage-topo-sort-output label-map))))
    (is (= {:nodes [:in1 :m3 :m2 :m4 :in2 :m5]
            :successors {:in1 #{:m2 :m3}
                         :in2 #{:m5}
                         :m2 #{:m4}
                         :m3 #{:m4}
                         :m4 #{:m5}}}
           (let [{:keys [nodes successors]} (#'pgu/topo-sort [m4])]
             (-> (#'pgu/topo-sort [m5] #{} nodes successors)
                 (massage-topo-sort-output label-map)))))))

(deftest test-analyzed?
  ;; TODO: write tests
  )

(deftest test-analyze
  ;; TODO: write tests
  )

(deftest test-transplant
  (let [in       (p/sinput :in)
        m1       (p/smap inc in)
        m2       (p/smap dec in)
        out1     (p/soutput :out m1)
        out2     (p/soutput :out m2)
        node-map {m1 m2, in in}]
    (is (= out2 (#'pgu/transplant out1 node-map))))
  (let [c (p/scell :c)]
    (is (= c (#'pgu/transplant c {})))))

(deftest test-walk-graph
  ;; TODO: write tests
  )

(defn example-fn1 [x]
  (+ x 1))

(defn example-fn2 [x]
  (+ x 2))

(defn example-fn3 [x]
  (+ x 3))

(defn example-fn4 [x]
  (+ x 4))

(defn example-fn5 [x]
  (+ x 5))

(defn example-fn6 [x]
  (+ x 6))

(defn example-fn7 [x]
  (+ x 7))

(deftest test-transplant-many
  (let [in        (p/sinput :in)
        m1        (p/smap example-fn1 in)
        m2        (p/smap example-fn2 in)
        m3        (p/smap example-fn3 m1)
        m4        (p/smap example-fn3 m2)
        m5        (p/smerge [m3 m4])
        m6        (p/smap example-fn4 m5)
        m7        (p/smap example-fn5 m5)
        out1a     (p/soutput :out1 m6)
        out2a     (p/soutput :out2 m7)
        m8        (p/smap example-fn6 m1)
        m9        (p/smap example-fn7 m2)
        out1b     (p/soutput :out1 m8)
        out2b     (p/soutput :out2 m9)
        label-map {in :in
                   m1 :m1
                   m2 :m2
                   m3 :m3
                   m4 :m4
                   m5 :m5
                   m6 :m6
                   m7 :m7
                   m8 :m8
                   m9 :m9
                   out1a :out1a
                   out1b :out1b
                   out2a :out2a
                   out2b :out2b}
        node-map1 {m6 m8, m7 m9, out1a out1b, out2a out2b}
        node-map2 (pgu/transplant-many [out1a out2a] {m6 m8, m7 m9})
        expected  (massage-node-map node-map1 label-map)
        actual    (massage-node-map node-map2 label-map)]
    (is (= expected actual))))

(deftest test-find-streams
  (let [in   (p/sinput :in)
        out1 (p/soutput :out1 in)
        out2 (p/soutput :out2 in)]
    (is (= [in]
           (pgu/find-streams #(= :input (:type %)) out1 out2)))
    (is (= [out2 out1]
           (pgu/find-streams #(= :output (:type %)) out1 out2)))
    (is (= [in]
           (->> (pgu/analyze out1 out2)
                (pgu/find-streams #(= :input (:type %))))))))

(deftest test-build-subgraph
  (let [in        (p/sinput :in)
        m1        (p/smap example-fn1 in)
        m2        (p/smap example-fn2 m1)
        m3        (p/smap example-fn3 m2)
        sub-in    (p/sinput :sub-in)
        sub-m2    (p/smap example-fn2 sub-in)
        sub-m3    (p/smap example-fn3 sub-m2)
        sub-out   (p/soutput :sub-out sub-m3)
        sub1      (pgu/analyze sub-out)
        sub2      (pgu/build-subgraph {:sub-in m1} {:sub-out m3})
        label-map (-> {in :in
                       m1 :m1
                       m2 :m2
                       m3 :m3
                       sub-in :sub-in
                       sub-m2 :sub-m2
                       sub-m3 :sub-m3
                       sub-out :sub-out
                       sub1 :sub1}
                      (assoc sub2 :sub2))
        expected  (massage-add-parents-output sub1 label-map)
        actual    (massage-add-parents-output sub2 label-map)]
    (is (= expected actual)))
  (let [in         (p/sinput :in)
        m1         (p/smap example-fn1 in)
        m2         (p/smap example-fn2 m1)
        m3         (p/smap example-fn3 m1)
        m4         (p/smap example-fn4 m2)
        m5         (p/smap example-fn5 m3)
        m6         (p/smerge [m4 m5])
        sub-in1    (p/sinput :sub-in1)
        sub-in2    (p/sinput :sub-in2)
        sub-m4     (p/smap example-fn4 sub-in1)
        sub-m5     (p/smap example-fn5 sub-in2)
        sub-m6     (p/smerge [sub-m4 sub-m5])
        sub-out1   (p/soutput :sub-out1 sub-m4)
        sub-out2   (p/soutput :sub-out2 sub-m5)
        sub-out3   (p/soutput :sub-out3 sub-m6)
        sub1       (pgu/analyze sub-out1 sub-out2 sub-out3)
        input-map  {:sub-in1 m2
                    :sub-in2 m3}
        output-map {:sub-out1 m4
                    :sub-out2 m5
                    :sub-out3 m6}
        sub2       (#'pgu/build-subgraph input-map output-map)
        label-map  {in :in
                    m1 :m1
                    m2 :m2
                    m3 :m3
                    m4 :m4
                    m5 :m5
                    m6 :m6
                    sub-in1 :sub-in1
                    sub-in2 :sub-in2
                    sub-m4 :sub-m4
                    sub-m5 :sub-m5
                    sub-m6 :sub-m6
                    sub-out1 :sub-out1
                    sub-out2 :sub-out2
                    sub-out3 :sub-out3}
        expected   (massage-add-parents-output sub1 label-map)
        actual     (massage-add-parents-output sub2 label-map)]
    (is (= expected actual))))

