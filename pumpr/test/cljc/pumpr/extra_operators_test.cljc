(ns pumpr.extra-operators-test
  (:require [pumpr.core :as p]
            [pumpr.graph-utils :as pgu]
            [pumpr.eval-executor :as pee]
            [pumpr.extra-operators :as peo]
            #?(:clj [clojure.test :refer [deftest is testing]]
               :cljs [cljs.test :refer-macros [deftest is testing]])))

(deftest test-sreduce
  (let [in               (p/sinput :in2)
        sr               (peo/sreduce + 5 in)
        group-start      (-> sr :parents first)
        subgraph         (:subgraph group-start)
        out              (p/soutput :out sr)
        sc               (pee/scompile out)
        group-cell-id    (-> group-start :cell :id)
        subgraph-cell-id (-> (pgu/find-streams p/cell? subgraph)
                             first
                             :id)]
    (is (= {:out 8, group-cell-id {subgraph-cell-id 8}}
           (pee/run {:in2 3} sc)))
    (is (= {:out 11, group-cell-id {subgraph-cell-id 11}}
           (pee/run {:in2 3, group-cell-id {subgraph-cell-id 8}} sc)))))

