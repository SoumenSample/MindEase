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
import { Menu, X, Bell, BellOff, Phone, User2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function UserDashboard() {
  const { authState, signOut } = useAuth();
  const [tab, setTab] = useState("status");
  const [profile, setProfile] = useState({ 
    username: "", 
    age: "", 
    height: "", 
    avatar_url: "",
    phone: "",
    doctor_phone: "",
    alert_enabled: false,
    doctor_alert_enabled: false
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [stressScore, setStressScore] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [alertHistory, setAlertHistory] = useState([]);
  const [manualAlertOpen, setManualAlertOpen] = useState(false);

  // Stress state thresholds (match ESP32 values)
  const STRESS_LOW = 0.3;
  const STRESS_HIGH = 0.7;
  const STRESS_CRITICAL = 0.85; // New threshold for critical alerts

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

  // Check for high stress and trigger alerts
  useEffect(() => {
    if (stressScore >= STRESS_CRITICAL && profile.alert_enabled) {
      triggerAlert("automatic", "Critical stress level detected");
    } else if (stressScore >= STRESS_HIGH && profile.alert_enabled) {
      triggerAlert("automatic", "High stress level detected");
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
        avatar_url: data.avatar_url ?? "",
        phone: data.phone ?? "",
        doctor_phone: data.doctor_phone ?? "",
        alert_enabled: data.alert_enabled ?? false,
        doctor_alert_enabled: data.doctor_alert_enabled ?? false
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
      setStressScore(data.stress_score ?? calculateStressScore(data));
    }
  };

  const fetchAlertHistory = async () => {
    if (!authState.user?.id) return;
    const { data } = await supabase
      .from("alerts")
      .select("*")
      .eq("user_id", authState.user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (data) setAlertHistory(data);
  };

  const calculateStressScore = (metrics) => {
    if (!metrics) return 0;
    
    const {
      gsr = 0,
      heartbeat = 0,
      spo2 = 100,
      temperature = 0
    } = metrics;

    const GSR_NORMAL = 1500;
    const HR_NORMAL = 72;
    const TEMP_NORMAL = 36.5;
    const SPO2_NORMAL = 98;
    const GSR_THRESHOLD = 2500;
    const HR_THRESHOLD = 80;
    const TEMP_THRESHOLD = 37.2;
    const SPO2_THRESHOLD = 95;

    const gsrFactor = Math.max(0, gsr - GSR_NORMAL) / (GSR_THRESHOLD - GSR_NORMAL);
    const hrFactor = Math.max(0, heartbeat - HR_NORMAL) / (HR_THRESHOLD - HR_NORMAL);
    const tempFactor = Math.max(0, temperature - TEMP_NORMAL) / (TEMP_THRESHOLD - TEMP_NORMAL);
    const spo2Factor = Math.max(0, SPO2_NORMAL - spo2) / (SPO2_NORMAL - SPO2_THRESHOLD);
    
    return (gsrFactor * 0.3) +
           (hrFactor * 0.25) +
           (tempFactor * 0.2) +
           (spo2Factor * 0.25);
  };

  // Send SMS via API (you'll need to implement or connect to an SMS service)
  const sendSMS = async (phoneNumber, message) => {
    // This is a placeholder - implement with your SMS provider API
    console.log(`Sending SMS to ${phoneNumber}: ${message}`);
    
    // Example implementation with Twilio or other SMS service:
    /*
    const response = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phoneNumber, body: message })
    });
    return response.ok;
    */
    
    // For demo purposes, we'll just log it
    return true;
  };

  const triggerAlert = async (type, reason) => {
    if (!authState.user?.id) return;
    
    const alertData = {
      user_id: authState.user.id,
      type,
      reason,
      stress_level: stressScore,
      status: "triggered"
    };

    // Save alert to database
    const { error } = await supabase.from("alerts").insert(alertData);
    
    if (error) {
      console.error("Error saving alert:", error);
      return;
    }

    // Send SMS to user if alerts are enabled
    if (profile.alert_enabled && profile.phone) {
      const userMessage = `MindEase Alert: ${reason}. Your current stress level is ${Math.round(stressScore * 100)}%.`;
      await sendSMS(profile.phone, userMessage);
    }

    // Send SMS to doctor if doctor alerts are enabled
    if (profile.doctor_alert_enabled && profile.doctor_phone) {
      const doctorMessage = `Patient Alert: ${profile.username || "User"} is experiencing ${reason}. Current stress level: ${Math.round(stressScore * 100)}%.`;
      await sendSMS(profile.doctor_phone, doctorMessage);
    }

    // Update alert history
    fetchAlertHistory();
    toast.info(`Alert triggered: ${reason}`);
  };

  const handleManualAlert = () => {
    triggerAlert("manual", "Manually triggered alert");
    setManualAlertOpen(false);
  };

  useEffect(() => {
    fetchProfile();
    fetchLatestMetrics();
    fetchAlertHistory();
    
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
      avatar_url,
      phone: profile.phone,
      doctor_phone: profile.doctor_phone,
      alert_enabled: profile.alert_enabled,
      doctor_alert_enabled: profile.doctor_alert_enabled
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
    } else if (stressScore < STRESS_CRITICAL) {
      return {
        text: "High Stress 😖",
        color: "bg-orange-500",
        icon: "🟠"
      };
    } else {
      return {
        text: "Critical Stress 🚨",
        color: "bg-red-500",
        icon: "🔴"
      };
    }
  };

  const stressState = getStressState();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Mobile header */}
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

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className={`${mobileSidebarOpen ? 'block' : 'hidden'} lg:block w-64 bg-white border-r p-4 space-y-4 fixed lg:static h-full z-50 lg:z-auto`}>
          <h1 className="text-xl font-bold mb-4 hidden lg:block">MindEase</h1>
          
          {/* Navigation */}
          {["status", "exercises", "alerts"].map((k) => (
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
          
          {/* Alert Management Section */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4" /> Alert Settings
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="alerts-toggle">Enable Alerts</Label>
                <Switch
                  id="alerts-toggle"
                  checked={profile.alert_enabled}
                  onCheckedChange={(checked) => setProfile({...profile, alert_enabled: checked})}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="doctor-alerts">Doctor Alerts</Label>
                <Switch
                  id="doctor-alerts"
                  checked={profile.doctor_alert_enabled}
                  onCheckedChange={(checked) => setProfile({...profile, doctor_alert_enabled: checked})}
                />
              </div>
              
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => setManualAlertOpen(true)}
              >
                <Bell className="w-4 h-4 mr-2" /> Trigger Manual Alert
              </Button>
            </div>
          </div>
          
          {/* Recent Alerts */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4" /> Recent Alerts
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {alertHistory.length > 0 ? (
                alertHistory.map((alert, index) => (
                  <div key={index} className="p-2 bg-white rounded border text-sm">
                    <div className="font-medium">{alert.reason}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(alert.created_at).toLocaleString()} • {alert.type}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 p-2">No recent alerts</div>
              )}
            </div>
          </div>
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

          {/* Profile Sheet */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right" className="w-[90vw] sm:w-[400px] overflow-y-auto">
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
              
              <div className="mt-6 space-y-4">
                <h3 className="font-semibold">Alert Settings</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="phone">Your Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => setProfile({...profile, phone: e.target.value})}
                      placeholder="+1234567890"
                    />
                    <p className="text-xs text-gray-500 mt-1">For receiving alerts</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="doctor-phone">Doctor's Phone Number</Label>
                    <Input
                      id="doctor-phone"
                      type="tel"
                      value={profile.doctor_phone}
                      onChange={(e) => setProfile({...profile, doctor_phone: e.target.value})}
                      placeholder="+1234567890"
                    />
                    <p className="text-xs text-gray-500 mt-1">For emergency alerts</p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="alerts-toggle">Enable Alerts</Label>
                    <Switch
                      id="alerts-toggle"
                      checked={profile.alert_enabled}
                      onCheckedChange={(checked) => setProfile({...profile, alert_enabled: checked})}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="doctor-alerts">Enable Doctor Alerts</Label>
                    <Switch
                      id="doctor-alerts"
                      checked={profile.doctor_alert_enabled}
                      onCheckedChange={(checked) => setProfile({...profile, doctor_alert_enabled: checked})}
                    />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Manual Alert Dialog */}
          {manualAlertOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <Card className="p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-red-500" />
                  Trigger Manual Alert
                </h3>
                <p className="mb-4">Are you sure you want to send an emergency alert?</p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setManualAlertOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleManualAlert}>
                    Send Alert
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Tab Content */}
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
            
            {tab === "alerts" && (
              <div className="space-y-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Bell className="w-5 h-5" /> Alert History
                  </h3>
                  <div className="space-y-2">
                    {alertHistory.length > 0 ? (
                      alertHistory.map((alert, index) => (
                        <div key={index} className="p-3 bg-gray-50 rounded border">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium">{alert.reason}</div>
                              <div className="text-sm text-gray-500">
                                {new Date(alert.created_at).toLocaleString()}
                              </div>
                            </div>
                            <span className="text-xs px-2 py-1 bg-gray-200 rounded-full">
                              {alert.type}
                            </span>
                          </div>
                          <div className="mt-1 text-sm">
                            Stress level: {Math.round(alert.stress_level * 100)}%
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No alert history found
                      </div>
                    )}
                  </div>
                </Card>
                
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <User2 className="w-5 h-5" /> Emergency Contacts
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <Label>Your Phone Number</Label>
                      <div className="mt-1 font-medium">
                        {profile.phone || "Not set"}
                      </div>
                    </div>
                    <div>
                      <Label>Doctor's Phone Number</Label>
                      <div className="mt-1 font-medium">
                        {profile.doctor_phone || "Not set"}
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setSheetOpen(true)}
                      className="w-full"
                    >
                      Edit Contact Information
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}