"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import BiometricsChart from "@/components/BiometricsChart";
import BiometricsForm from "@/components/BiometricsForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import ProfileForm from "../components/ProfileForm";
import BreathingExercise from "@/components/BreathingExercise";
import Footer from "@/components/Footer";

export default function UserDashboard() {
  const { authState, signOut } = useAuth();
  const [tab, setTab] = useState("status");
  const [profile, setProfile] = useState({ username: "", age: "", height: "", avatar_url: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [stressScore, setStressScore] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);

  // Stress state thresholds (match ESP32 values)
  const STRESS_LOW = 0.3;
  const STRESS_HIGH = 0.7;

  // Blinking effect for moderate stress
  useEffect(() => {
    if (stressScore >= STRESS_LOW && stressScore < STRESS_HIGH) {
      const interval = setInterval(() => {
        setIsBlinking(prev => !prev);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setIsBlinking(false);
    }
  }, [stressScore]);

  const fetchProfile = async () => {
    if (!authState.user?.id) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authState.user.id)
      .single();

    if (!error && data) {
      setProfile({
        username: data.username ?? "",
        age: data.age?.toString() ?? "",
        height: data.height?.toString() ?? "",
        avatar_url: data.avatar_url ?? ""
      });
    }
  };

  const fetchLatestMetrics = async () => {
    if (!authState.user?.id) return;
    const { data } = await supabase
      .from("biometrics")
      .select("gsr, heartbeat, spo2, temperature, stress_score")
      .eq("user_id", authState.user.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setLatestMetrics(data);
      // Use the stress_score from database if available, otherwise calculate
      setStressScore(data.stress_score ?? calculateStressScore(data));
    }
  };

  // Calculate stress score matching ESP32 algorithm
  const calculateStressScore = (metrics) => {
    if (!metrics) return 0;
    
    const {
      gsr = 0,
      heartbeat = 0,
      spo2 = 100,
      temperature = 0
    } = metrics;

    // Normalization factors (match ESP32 values)
    const GSR_NORMAL = 1500;
    const HR_NORMAL = 72;
    const TEMP_NORMAL = 36.5;
    const SPO2_NORMAL = 98;

    // Thresholds (match ESP32 values)
    const GSR_THRESHOLD = 2500;
    const HR_THRESHOLD = 80;
    const TEMP_THRESHOLD = 37.2;
    const SPO2_THRESHOLD = 95;

    // Calculate normalized deviations
    const gsrFactor = Math.max(0, gsr - GSR_NORMAL) / (GSR_THRESHOLD - GSR_NORMAL);
    const hrFactor = Math.max(0, heartbeat - HR_NORMAL) / (HR_THRESHOLD - HR_NORMAL);
    const tempFactor = Math.max(0, temperature - TEMP_NORMAL) / (TEMP_THRESHOLD - TEMP_NORMAL);
    const spo2Factor = Math.max(0, SPO2_NORMAL - spo2) / (SPO2_NORMAL - SPO2_THRESHOLD);
    
    // Weighted stress score (match ESP32 weights)
    return (gsrFactor * 0.3) +
           (hrFactor * 0.25) +
           (tempFactor * 0.2) +
           (spo2Factor * 0.25);
  };

  useEffect(() => {
    fetchProfile();
    fetchLatestMetrics();
    
    // Set up real-time updates
    const channel = supabase
      .channel('biometrics')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'biometrics',
        filter: `user_id=eq.${authState.user?.id}`
      }, (payload) => {
        setLatestMetrics(payload.new);
        setStressScore(payload.new.stress_score ?? calculateStressScore(payload.new));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authState.user]);

  // ... (keep existing uploadAvatar, saveProfile, handleLogout functions)
  
 const uploadAvatar = async () => {
    if (!avatarFile || !authState.user) return null;
    const ext = avatarFile.name.split(".").pop();
    const path = `${authState.user.id}/avatar.${ext}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, {
        upsert: true,
        cacheControl: "3600",
        contentType: avatarFile.type
      });

    if (error) {
      toast.error("Avatar upload failed: " + error.message);
      return null;
    }

    return supabase.storage.from("avatars").getPublicUrl(path).data?.publicUrl ?? null;
  };

  const saveProfile = async () => {
    if (!authState.user?.id) return;
    let avatar_url = profile.avatar_url;

    if (avatarFile) {
      const url = await uploadAvatar();
      if (url) avatar_url = url;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: authState.user.id,
      username: profile.username.trim(),
      age: Number(profile.age) || null,
      height: Number(profile.height) || null,
      avatar_url
    });

    if (!error) {
      toast.success("Profile updated!");
      setAvatarFile(null);
      setSheetOpen(false);
      fetchProfile();
    } else {
      toast.error(error.message);
    }
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/";
  };


  // Determine stress state based on score
  const getStressState = () => {
    if (stressScore < STRESS_LOW) {
      return {
        text: "Relaxed 😊",
        color: "bg-green-500",
        icon: "🟢"
      };
    } else if (stressScore < STRESS_HIGH) {
      return {
        text: "Moderate Stress 😐",
        color: isBlinking ? "bg-green-500" : "bg-green-600",
        icon: "🟡"
      };
    } else {
      return {
        text: "High Stress 😖",
        color: "bg-red-500",
        icon: "🔴"
      };
    }
  };

  const stressState = getStressState();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Flex row: sidebar + main content */}
      <div className="flex flex-1">
        <aside className="w-64 bg-white border-r p-4 space-y-4">
          <h1 className="text-xl font-bold mb-4">MindEase</h1>
          {["status", "exercises", "alert"].map((k) => (
            <Button key={k} variant="ghost" className="w-full justify-start" onClick={() => setTab(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </Button>
          ))}
        </aside>

        <main className="flex-1 p-6 bg-gray-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Hello, {profile.username || "User"}</h2>

            <div className="flex items-center space-x-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Card className={`px-4 py-2 rounded-xl shadow text-white text-sm font-semibold ${stressState.color}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{stressState.icon}</span>
                    <span>{stressState.text}</span>
                    <span className="ml-2 text-xs opacity-80">({Math.round(stressScore * 100)}%)</span>
                  </div>
                </Card>
              </motion.div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="cursor-pointer">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback>{profile.username?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSheetOpen(true); }}>
                    Edit profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleLogout(); }} className="text-red-600">
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* ... (rest of your existing JSX remains the same) */}
        </main>
      </div>

      <Footer />
    </div>
  );
}