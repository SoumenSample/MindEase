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
import { Menu, X } from "lucide-react";

export default function UserDashboard() {
  const { authState, signOut } = useAuth();
  const [tab, setTab] = useState("status");
  const [profile, setProfile] = useState({ username: "", age: "", height: "", avatar_url: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [stressScore, setStressScore] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [stressLogs, setStressLogs] = useState([]);
  const [timeFilter, setTimeFilter] = useState('24h');

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
      .select("gsr, heartbeat, spo2, temperature, stress_score, recorded_at")
      .eq("user_id", authState.user.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setLatestMetrics(data);
      setStressScore(data.stress_score ?? calculateStressScore(data));
    }
  };

  const fetchStressLogs = async () => {
    if (!authState.user?.id) return;
    const { data } = await supabase
      .from("biometrics")
      .select("*")
      .eq("user_id", authState.user.id)
      .gte("stress_score", STRESS_HIGH)
      .order("recorded_at", { ascending: false })
      .limit(50);

    if (data) setStressLogs(data);
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
    fetchStressLogs();
    
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
        const newScore = payload.new.stress_score ?? calculateStressScore(payload.new);
        setStressScore(newScore);
        
        // Add to logs if high stress
        if (newScore >= STRESS_HIGH) {
          setStressLogs(prev => [payload.new, ...prev.slice(0, 49)]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authState.user]);

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

  // Filter logs based on time selection
  const filteredLogs = stressLogs.filter(log => {
    const logTime = new Date(log.recorded_at).getTime();
    const now = Date.now();
    
    if (timeFilter === '24h') return now - logTime <= 24 * 60 * 60 * 1000;
    if (timeFilter === 'week') return now - logTime <= 7 * 24 * 60 * 60 * 1000;
    return true;
  });

  const stressState = getStressState();

  const StressLogComponent = () => (
    <div className="mt-6 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Stress Events Log</h3>
        <div className="flex gap-2">
          <Button 
            variant={timeFilter === '24h' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeFilter('24h')}
          >
            Last 24h
          </Button>
          <Button 
            variant={timeFilter === 'week' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeFilter('week')}
          >
            Last Week
          </Button>
          <Button 
            variant={timeFilter === 'all' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeFilter('all')}
          >
            All Time
          </Button>
        </div>
      </div>
      
      {filteredLogs.length === 0 ? (
        <Card className="p-4 text-center text-gray-500">
          No high stress events recorded in this period
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log, index) => {
            const severity = log.stress_score >= 0.9 ? 'high' : 
                           log.stress_score >= 0.7 ? 'medium' : 'low';
            
            return (
              <Card 
                key={index}
                className={`p-4 border-l-4 transition-all ${
                  severity === 'high' ? 'border-red-500 bg-red-50' :
                  severity === 'medium' ? 'border-orange-500 bg-orange-50' :
                  'border-yellow-500 bg-yellow-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {new Date(log.recorded_at).toLocaleString()}
                    </p>
                    <p className="text-sm">
                      Stress level: <span className="font-semibold">{Math.round(log.stress_score * 100)}%</span>
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    severity === 'high' ? 'bg-red-500 text-white' :
                    severity === 'medium' ? 'bg-orange-500 text-white' :
                    'bg-yellow-500 text-gray-800'
                  }`}>
                    {severity === 'high' ? 'Severe' : 
                     severity === 'medium' ? 'High' : 'Elevated'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">HR:</span>
                    <span>{log.heartbeat} BPM</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">GSR:</span>
                    <span>{log.gsr}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Temp:</span>
                    <span>{log.temperature?.toFixed(1)}°C</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">SpO2:</span>
                    <span>{log.spo2}%</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Mobile header with hamburger menu */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        >
          {mobileSidebarOpen ? <X /> : <Menu />}
        </Button>
        <h1 className="text-xl font-bold">MindEase</h1>
        <div className="w-10"></div>
      </div>

      {/* Flex row: sidebar + main content */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className={`${mobileSidebarOpen ? 'block' : 'hidden'} lg:block w-64 bg-white border-r p-4 space-y-4 fixed lg:static h-full z-50 lg:z-auto`}>
          <h1 className="text-xl font-bold mb-4 hidden lg:block">MindEase</h1>
          {["status", "exercises", "logs"].map((k) => (
            <Button 
              key={k} 
              variant="ghost" 
              className="w-full justify-start"
              onClick={() => {
                setTab(k);
                setMobileSidebarOpen(false);
              }}
            >
              {k[0].toUpperCase() + k.slice(1)}
            </Button>
          ))}
        </aside>

        {/* Main content */}
        <main className={`flex-1 p-4 lg:p-6 bg-gray-50 flex flex-col ${mobileSidebarOpen ? 'ml-64' : ''} lg:ml-0`}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-semibold">Hello, {profile.username || "User"}</h2>

            <div className="flex items-center justify-between sm:justify-end gap-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex-1 sm:flex-none"
              >
                <Card className={`px-3 py-1 sm:px-4 sm:py-2 rounded-xl shadow text-white text-sm font-semibold ${stressState.color}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{stressState.icon}</span>
                    <span className="hidden sm:inline">{stressState.text}</span>
                    <span className="sm:ml-2 text-xs opacity-80">({Math.round(stressScore * 100)}%)</span>
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

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right" className="w-[90vw] sm:w-[360px]">
              <SheetHeader>
                <SheetTitle>Edit profile</SheetTitle>
              </SheetHeader>
              <ProfileForm
                profile={profile}
                setProfile={setProfile}
                avatarFile={avatarFile}
                setAvatarFile={setAvatarFile}
                onSave={saveProfile}
              />
            </SheetContent>
          </Sheet>

          <div className="flex-1 overflow-auto">
            {tab === "status" && (
              <Tabs defaultValue="charts">
                <TabsList className="mb-6 w-full sm:w-auto">
                  <TabsTrigger value="charts" className="flex-1 sm:flex-none">Dashboard</TabsTrigger>
                  <TabsTrigger value="push" className="flex-1 sm:flex-none">Push Test Data</TabsTrigger>
                </TabsList>

                <TabsContent value="charts">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <BiometricsChart type="gsr" title="GSR" />
                    <BiometricsChart type="heartbeat" title="Heart Rate" />
                    <BiometricsChart type="spo2" title="SpO₂" />
                    <BiometricsChart type="temperature" title="Temperature" />
                  </div>
                  <StressLogComponent />
                </TabsContent>

                <TabsContent value="push">
                  <div className="max-w-xl mx-auto bg-white p-4 sm:p-6 rounded-xl shadow">
                    <h2 className="text-lg font-semibold mb-4">Push Biometric Test Data</h2>
                    <BiometricsForm />
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {tab === "exercises" && (
              <div className="text-lg">
                <BreathingExercise />
              </div>
            )}
            
            {tab === "logs" && (
              <div className="space-y-4">
                <StressLogComponent />
              </div>
            )}
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}