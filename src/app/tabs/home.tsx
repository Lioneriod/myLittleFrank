import React, { useEffect, useRef } from "react";
import { ImageBackground, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSession } from "../../contexts/SessionContext";
import MonsterStats from "../../components/MonsterStats";
import Frank, { type FrankHandle } from "../components/Frank";
import { supabase } from "@/src/lib/supabase";

export default function Home() {
  const { width, height } = useWindowDimensions();
  const { monster } = useSession();
  const frank = useRef<FrankHandle>(null);

  useEffect(() => {
    if (!monster) return;
    let cancelled = false;

    (async () => {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      const { data: member, error: memberErr } = await supabase
        .from("monster_members")
        .select("monster_id, user_id")
        .eq("monster_id", monster.id)
        .maybeSingle();

      if (cancelled) return;
      console.log({
        user: user?.id,
        userErr,
        member,
        memberErr,
        monsterId: monster.id,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [monster?.id]);

  return (
    <ImageBackground
      source={require("../assets/bgs/telaPrincipal.jpg")}
      style={[styles.background, { width, height }]}
      resizeMode="stretch"
    >
      {monster && (
        <>
          <View
            style={[
              styles.statsSlot,
              { top: height * 0.3, left: width * 0.05, width: width * 0.42 },
            ]}
          >
            <MonsterStats monster={monster} />
          </View>

          <Frank ref={frank} monsterId={monster.id} placement="home" />
        </>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { position: "absolute", top: 0, left: 0 },
  statsSlot: { position: "absolute" },
});